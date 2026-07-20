# PI Workflow 2.0 — Refactor sandbox (Dev_200)

> **➡️ Trabajo activo en la pestaña "Anotaciones" (#13): retomar desde
> [`HANDOFF_ANOTACIONES.md`](HANDOFF_ANOTACIONES.md)** — handoff autocontenido al build 24 (2026-07-05).

Sandbox aislado, hermano de `Dev_194`. Aquí se hace el refactor por fases
("PI Workflow 2.0"). **`Dev_194` queda intacto como producción / red de seguridad.**
Los usuarios en PixInsight 1.9.3 se quedan con el repositorio publicado antiguo
(este sandbox solo apunta a 1.9.4 / V8; el dual-build 1.9.3 se elimina).

## VERSIÓN Y BUILDS (trazabilidad)
Definidos en `PI Workflow.js`: `OPT_VERSION`, `OPT_BUILD`, `OPT_BUILD_DATE`. La
cabecera del diálogo los muestra en la sub-fila del título en el orden
**versión · fecha · build** (`ui/dialog_chrome.js`, `optBuildWorkflowTitleBar`).

**Política (acordada 2026-07-05):**
- **`OPT_VERSION`** (p.ej. `1.0`): la cambia **solo el usuario**, cuando lo pide
  explícitamente. Nunca automáticamente.
- **`OPT_BUILD`**: contador **monotónico** que se **incrementa en CADA modificación**
  del script (lo hace quien edita, automáticamente). No se reinicia al subir versión.
- **`OPT_BUILD_DATE`**: fecha (AAAA-MM-DD) del build actual; se actualiza junto con `OPT_BUILD`.
- Cada build se anota en la tabla de abajo para trazabilidad por cambio.

## CONVENCIÓN — Añadir un algoritmo nuevo a un desplegable (OBLIGATORIO)
Cuando añadas un **algoritmo nuevo** a cualquier menú/desplegable de algoritmos (Gradient
Correction, **Color Correction**, Deconvolution, Stretch RGB/Stars, Star Split, Noise Reduction,
Sharpening), NO basta con crear su card/combo + motor. Hay que actualizar **TODOS** estos puntos o
el algoritmo no aparecerá en Configuración, no será desactivable, o faltará en la comparación:

1. **Configuración** — añadirlo a `OPT_ALGO_MENUS` (`engine/config_registry.js`) en el menú
   correspondiente, en el **mismo orden** que el combo/card. (Es lo que puebla la pestaña Configuración.)
2. **Enmascarado por enable/disable** — su visibilidad debe pasar por `optIsAlgoEnabled(menuId, prefId)`:
   - Combos → `optWireFilterableCombo({ ..., entries, menuId })` ya lo hace (`ui/tabs_core.js`).
   - **Action cards** (Color Correction) → añadir la llamada `wireColorCard(btn, prefId, installed)`.
3. **Grid de comparación** (si el menú tiene "compare all") — añadirlo a los arrays
   `allNames / allActionKeys / allPrefIds / allInstalled` (`ui/tabs_core.js`).
4. **Tooltips en AMBOS idiomas** — entrada `button.<ID>` en las tablas ES **y** EN de
   `PI Workflow_resources.jsh`.
5. **Help / manual** — documentarlo en `PI Workflow_help.xhtml` **y** `PI Workflow_help_es.xhtml`.

> **Checklist rápido:** registro · enmascarado · comparación · tooltips ES+EN · help.
> *(Lección de SSSC, build 26: tenía card + motor + tooltips + help pero faltaban los 3 puntos de
> enumeración de `preColor` → no salía en Configuración. Color Correction es el más frágil por usar
> action cards + 3 listas manuales; los combos que van por `optWireFilterableCombo` con fuente única
> son menos propensos a drift.)*

| Build | Fecha | Versión | Cambios |
|------:|------------|:-------:|---------|
| 35 | 2026-07-16 | 1.0 | **Soporte de los NUEVOS modelos SyQon (port desde la RC, donde el usuario lo validó en GUI; allí es el "build 31 de la RC").** (1) **Starless reescrito al contrato "Axiom V3"** del nuevo `SyQonStarless.exe` (app Qt6, `C:\Program Files\SyQon\Starless`): los flags del CLI Python antiguo ya no existen (salida inmediata) y el exe solo lee TIFF/PNG → entrada TIFF float 32 (`optSaveViewToTIFF`), args `-i/-o/-v/-d Auto\|GPU\|CPU/-c pixinsight` y **SIN `--gui`** (corre oculto; la ventana que se veía era ese flag, que el script del vendor pasa a propósito); guarda de tamaño mínimo 512 px (el exe revienta con imágenes menores que su tesela fija — verificado contra el binario); reintento automático en CPU; regex de progreso "[CLI] Progress: N%". (2) **Fix del contrato in-place**: el fallback SyQon de `optCabraMakeStarless` ignoraba el retorno (la vista conservaba las estrellas + 2 ventanas fugadas) → nuevo `params.applyToTarget` en [external_tools.js](engine/external_tools.js). (3) **Parallax v1.5**: combo **"Model Style" Natural/Defined** (= classic/aesthetics, etiquetas del diálogo de SyQon) en Pre Decon ([sections_pre_stretch.js](ui/sections_pre_stretch.js)) y Post Sharpening ([sections_post.js](ui/sections_post.js)); `--mode` solo se pasa si no es el default (compat CLIs antiguos); Defined limita star reduction a 7 (lo hace el CLI). (4) **Prism**: flags verificados sin cambios contra `--help`. (5) UI Star Split SyQon simplificada (Overlap def. 64 + Device + Stars Mode) y tooltips ES/EN (`parallax.mode`, `starless.device`; retiradas 6 claves del CLI viejo). Batería (regla viva): **suite `syqon_v3_smoke.js`** (S1-S7, GREEN 7/7 en la RC con los ejecutables reales) + test SyQon Starless de nivel 2 alineado al contrato nuevo (`applyToTarget`). Verificado en Dev: node --check · nivel 0 · regression 59/59 · nivel 1 · smoke SyQon (ver nota de verificación). |
| 34 | 2026-07-08 | 1.0 | **Autoasignación de slots también para imágenes YA ABIERTAS** (informe del usuario probando el build 32: `MasterLight_H/O/S` abiertas con File > Open ANTES de lanzar el script quedaban en None — la autoasignación solo se disparaba desde el botón "Cargar Archivos de Imagen…"). Nuevo `OptSelectionPanel.autoAssignFromOpenWindows` ([panels.js](ui/panels.js)): construye entries desde TODAS las ventanas del workspace (fuente: `win.filePath` si viene de disco, si no el id de la vista — cubre p.ej. los `_HA/_OIII/_SII` de DBXtract — más el keyword FILTER) y delega en `autoAssignSlots` (mismo contrato: solo slots del modo activo en "None", nunca pisa, log en consola "=> Image Selection: auto-assigned …"). Cableado en `OptSelectionPanel.refresh()` (arranque del diálogo vía refreshSelections, entrada en Anotaciones, botón de carga) y en `setMode()` (elegir NB con los másters ya abiertos rellena H/O/S al momento; inocuo en el constructor, combos aún vacíos). Caso GUI añadido a GUI_CHECKLIST.md. Verificado: node --check · nivel 0 GREEN · regression 59/59 GREEN · nivel 1 GREEN. **Pendiente: validar en GUI** (abrir los 3 másters → lanzar script → modo NB → H/O/S asignados). Igual que el build 32: NO va a la RC (post-release). |
| 33 | 2026-07-08 | 1.0 | **GOLDEN v2: neutralización automática del fondo** (feedback del usuario: al combinar un set H/O/S lineal salía una imagen azul sólida y había que corregirla con balance de color a posteriori). Causa: pesos por canal sin normalizar (B suma 2.15 vs R 1.40) + pedestales de cielo de cada filtro entrando en la mezcla. Arreglo DENTRO de la paleta ([channels.js](engine/channels.js), `optCreateGoldenNbFromChannels`): (1) resta la **mediana** de cada mono (pedestal de cielo); (2) **normaliza** cada canal de salida por su suma de pesos (R/1.40 · G/1.55 · B/2.15; sin SII: /1.40 · /0.75 · /1.15); (3) devuelve un **pedestal neutro** p=min(medianas) → el fondo queda gris neutro y solo la señal lleva los tintes, en lineal y en estirado. Tooltips ES+EN actualizados (fuera el aviso "mejor sobre monos estirados"). Suite NB: verificación de pesos actualizada a la fórmula v2 + **check nuevo de fondo neutro** (medianas R/G/B del combinado parejas, spread <5e-4). Verificado: nivel 0 31/0 · regression 59/59 · NB suite 48/48 · **GUI real con el trío H/O/S drizzle: de imagen azul sólida → nebulosa violeta/dorada sobre fondo neutro a la primera** (validado visualmente). Solo Dev_200. |
| 32 | 2026-07-08 | 1.0 | **"Cargar Archivos de Imagen…" ahora AUTOASIGNA los slots del selector** (mejora detectada en la verificación profunda de la RC: cargar C1_HO/C2_OS desde NB dejaba HO/OS en None). Inferencia por **sufijo del nombre** (`optInferSlotFromName`, [utils.js](engine/utils.js): _HO→HO, _OS/_SO→OS, _Ha/_H→H, _OIII/_O3/_O→O, _SII/_S2/_S→S, _R/_G/_B/_L/_Lum→mono, _RGB→RGB; case-insensitive, null si no reconoce) con **fallback al keyword FILTER** (`optInferSlotFromFilter` + `optReadFilterKeyword`; cubre másters WBPP cuyo último token es "autocrop"). Panel ([panels.js](ui/panels.js)): `OptImageCombo.selectViewById` (dispara `onSelectionChanged` como un clic manual) + `OptSelectionPanel.autoAssignSlots` — SOLO rellena slots del **modo activo** que sigan en "None" (no pisa selecciones; primero-gana si dos ficheros reclaman un slot) y loguea "auto-assigned HO <- id (name/FILTER)". Batería: **pack P14 nuevo** (tabla de mapeo pura, regla viva) + caso GUI en GUI_CHECKLIST.md + P14 anotado en PLAN_BATERIA_TESTS.md. Verificado: node --check · nivel 0 31/0 GREEN · regression 59/59 GREEN · nivel 1 GREEN con P14. **Pendiente: validar en GUI** (NB + C1_HO/C2_OS → HO/OS se asignan solos). NO portado a `RELEASE_2.0_RC1` (decisión del usuario 2026-07-08: queda post-release, como anota INFO_RELEASE.md; la RC sigue = build 30). |
| 31 | 2026-07-08 | 1.0 | **Nueva paleta NB "GOLDEN" (Dorada)** — petición del usuario: Ha → oro viejo (R 1.00·G 0.65·B 0.15), OIII → violeta (R 0.40·G 0.10·B 1.00), SII → cian azulado (G 0.80·B 1.00). Paleta de **tintes ponderados** (cada canal = suma ponderada de las 3 líneas, truncada a [0,1] sin rescale), NO un mapeo 1:1. Cableado: (1) motor `optCreateGoldenNbFromChannels` en [channels.js](engine/channels.js) (bloque GOLDEN-PALETTE, SII opcional) + `optRecipeChannels` (dominantes H/S/O solo para metadatos) + `optIsNarrowbandRecipeName`; (2) ramas GOLDEN en `combineNb` ([tabs_core.js](ui/tabs_core.js), dual-band DBXtract y monos); (3) `OPT_RECIPE_NAMES` += GOLDEN; (4) **fila 4 de la parrilla** en [panels.js](ui/panels.js) (el grid hardcodeaba 3 filas; ahora hay fila 4 con padding a ancho de 1 columna → GOLDEN **debajo de HSS**); (5) tooltips `recipe.GOLDEN`+`button.GOLDEN` ES+EN; (6) help EN+ES + NarrowbandSPCC + batería (NB suite: GOLDEN dual-band, monos con **pesos verificados en píxeles exactos**, caso sin SII). ⚠️ Uso: sobre monos LINEALES de medianas parejas domina el azul (B pesa 2.15) — esperado; aplicar sobre monos ESTIRADOS (en tooltip). Verificado: nivel 0 31/0 · regression 59/59 (las paletas no tocan el baseline) · NB suite 47/47 · batería 65/65 · GUI real con los másters H/O/S drizzle → `NB_RGB_GOLDEN` OK, botón bajo HSS confirmado. **Solo Dev_200** (pendiente decisión: ¿entra en la RC 2.0?). |
| 30 | 2026-07-08 | 1.0 | **Docstring de cabecera desactualizado (detectado en la sesión GUI del test E2E).** El comentario de `PI Workflow.js:12` decía "build 27, 2026-07-05" en fuente dura mientras `OPT_BUILD` real era 29 — duplicaba a mano lo que ya viven en `OPT_VERSION`/`OPT_BUILD`/`OPT_BUILD_DATE`. Arreglo de raíz: el docstring ya NO lleva número de build ni fecha; remite a las variables (fuente única, no puede volver a derivar). Aplicado también a `RELEASE_2.0_RC1` (build 30). Solo comentario + bump; regression 59/59 GREEN. |
| 29 | 2026-07-08 | 1.0 | **Cierre del último fallo silencioso de tools IA: StarNet2.** En `optCabraMakeStarless` ([cabramagic.js:1173](engine/cabramagic.js:1173)), la rama de StarNet2 (`sn.executeOn(view); return "StarNet2";`) ignoraba el retorno → devolvía `"StarNet2"` afirmando que separó las estrellas aunque `executeOn` devolviera `false` (mismo patrón que el hallazgo Nº3, no cubierto por el build 28 por estar fuera de scope RC-Astro/DeepSNR). Ahora `optAssertExecuteOk(sn.executeOn(view), "StarNet2")`; como está dentro del try/catch de la cadena de fallback del star-split, un fallo real cae limpio a "sin motor" (`return null`) en vez de mentir. Portado también a `RELEASE_2.0_RC1` (build 29). Verificado: Dev_200 regression 59/59 + nivel 0 31/0 GREEN; RC regression parity 59/59 GREEN. |
| 28 | 2026-07-08 | 1.0 | **Arreglados los hallazgos Nº2 y Nº3 de la batería de tests + imágenes reales en P12.** (1) **DeepSNR en el help (hallazgo Nº2):** documentado en la tabla §6.1 de [PI Workflow_help.xhtml](PI Workflow_help.xhtml) y [PI Workflow_help_es.xhtml](PI Workflow_help_es.xhtml) (fila nueva: intensidad 0–1 def. 1.0, modelo deep-learning no lineal; internos fijos v2/shadows −2.80/target 0.25) + encabezado/intro/TOC actualizados de "cinco"→"seis" motores. Con esto DeepSNR cumple los 6 sitios de la convención y el nivel 0 pasa a GREEN (sitio 5 EN/ES). (2) **Wrappers RC-Astro/IA endurecidos (hallazgo Nº3):** nuevo helper `optAssertExecuteOk(ret, tool)` en [utils.js](engine/utils.js) que lanza si `executeOn` devuelve `false`; aplicado en `optCabraStarless` (SXT, [cabramagic.js:466](engine/cabramagic.js:466)), `optExecuteBlurXConfiguredOnView` (BXT, [external_tools.js:15](engine/external_tools.js:15)), `optExecuteNoiseXConfiguredOnView` (NXT, [post.js:31](engine/post.js:31)) y `optExecuteDeepSNROnView` (DeepSNR, [post.js:56](engine/post.js:56)). Antes un fallo silencioso de la IA (p.ej. sin GPU en headless) dejaba la imagen sin tocar y el pipeline creía que el paso se aplicó; ahora lanza. **Efecto secundario positivo:** repara las cadenas de fallback de CabraMagic (`optCabraDeconvFallback`/`optCabraDenoiseFallback`/`optCabraMakeStarless`), que ya usaban try/catch esperando la excepción y por tanto nunca avanzaban al siguiente motor. (3) **P12 con imágenes reales:** `battery_suite.js` P12 ahora abre un subconjunto curado del repositorio `CabraSpace/Pagina Web/Imagenes Prueba` (rgb_linear/galaxia/campo_estrellas/SHO/HSO/banda_ancha), recorta el centro ≤1024 px (`sfOpenRealCrop`) y corre invariantes STF+máscara — 6/6 PASS (<3.3 s c/u). `_tests/images/` sigue teniendo prioridad como override local. Verificado: regression 59/59 GREEN · nivel 0 31/0 GREEN · nivel 1 63 pass/0 fail (incl. 6 reales) · nivel 2 4 pass/4 skip · **battery_report.md GREEN**. |
| 27 | 2026-07-05 | 1.0 | **Continuum Subtraction: aviso visible cuando resta CON estrellas (objetos compactos).** Diagnóstico (workflow multi-agente, verificado en código): el anillo negro alrededor de estrellas **NO es un bug** — es la resta escalada `max(0, NB−k·(Cont−mediana))` ([continuum.js:295](engine/continuum.js:295)) sin igualar PSF; un `k` global sobre-resta las alas anchas de la estrella del continuo → anillo. Solo aparece en la **rama compacta** (índice concentración ≥ 3.0, [continuum.js:406](engine/continuum.js:406)) que resta CON estrellas **a propósito** (star-removal se comería los nudos HII compactos; documentado en :401-404). Fix: `optRunContinuumSubtractionAuto` ahora devuelve `compact:[líneas]`; la UI muestra aviso ámbar *"compact target — subtracted WITH stars, halos expected"* (antes solo iba a consola), y el panel `info` del módulo lo documenta. **Decisión de release:** no bloquea (la vía por defecto de nebulosas extendidas ya resta sobre starless). Pendiente (follow-up, no release): Continuum Subtraction NO tiene sección en el help formal (xhtml) — hay que añadirla; y arreglo profundo (PSF-match) para la rama compacta. |
| 26 | 2026-07-05 | 1.0 | **Fix: SSSC no aparecía en Configuración → Color Correction (no se podía activar/desactivar).** SSSC (Spectrophotometric Standard Star Calibration) estaba como *action card* + motor + tooltips ES/EN + help, pero NO cableado en los 3 puntos de enumeración de `preColor`: (1) registro `OPT_ALGO_MENUS` (config_registry.js), (2) enmascarado `wireColorCard` (tabs_core.js:1208), (3) arrays del grid de comparación (tabs_core.js:235). Añadido en los 3. Auditados los demás menús (gradient/decon/NR/sharp/starSplit/stretch): todos coinciden con el registro; SSSC era el único hueco. Ver **CONVENCIÓN "Añadir un algoritmo nuevo"** abajo. |
| 25 | 2026-07-05 | 1.0 | **Fix: secciones de "Mejora de Imagen" (y Anotaciones) salían expandidas al entrar.** `initializeSectionExpansion` (dialog_chrome.js) colapsaba al arranque solo `[PRE, STRETCH, POST, CC]`; las pestañas extra se configuran antes (líneas 298/304) y nacen expandidas → nunca se colapsaban. Añadido `OPT_TAB_IMGENH` + `OPT_TAB_ANNOT` a la lista (guardados por `this.imgEnhTab`/`this.annotTab`). Mismo patrón que el bug de los chips (build 17): funciones que iteran las 4 pestañas estándar y olvidan las nuevas. Detectado por el usuario probando la RC 2.0. |
| 1 | 2026-07-05 | 1.0 | Primer build del esquema de versionado. Incluye: botón "Cargar Archivos de Imagen…" en tipografía mono del panel; log de procesado sin botón (embebido/sidecars al exportar); pestaña 4 "Image Enhancement" → "Mejora de Imagen" (ES); versión 0.9 Beta → 1.0 + cabecera versión·fecha·build. |
| 2 | 2026-07-05 | 1.0 | Pestaña "Configuration" → "Configuración" (ES): entrada añadida en `OPT_I18N_ES`. |
| 24 | 2026-07-05 | 1.0 | **#13 — i18n completo de la pestaña Anotaciones.** Todos los literales de `ui/sections_annotations.js` pasados a **fuente inglés** + `optT()`/`optI18nLabel()` (controles registrados re-traducen al vuelta con el toggle ES/EN; estados dinámicos vía `optT`). Categorías/subtipos se mantienen como **claves internas en español** (no romper motor/tests); para mostrarlos, capa de display `OPT_ANN_CAT_EN`/`OPT_ANN_TYPELABEL_EN` + `optAnnCatLabelEN`/`optAnnTypeLabelEN` → optT. ~60 entradas nuevas en `OPT_I18N_ES` (categorías, subtipos, controles, tooltips, estados). Tests 68→73 GREEN, incluido uno que **carga el `OPT_I18N_ES` real y verifica 0 traducciones faltantes**. Limpiados ficheros `*.tmp.*` que dejaba `sed -i` en Windows. Pendiente: validar toggle ES/EN en GUI. |
| 23 | 2026-07-05 | 1.0 | **#13 — 2ª fuente de catálogo: VizieR (HyperLEDA) + infraestructura multi-fuente.** Motor: `optAnnOnlineSource(source)` selecciona (build,parse) por fuente; `optAnnQueryImage` despacha con él. VizieR vía **TAP `format=tsv`** (mismo TSV limpio que SIMBAD), catálogo **HyperLEDA VII/237/pgc**, filtro anti-flood `logD25 >= 1+log10(0.5)` + `TOP 500`; `optAnnParseVizierTsv` convierte logD25→size y logR25→minor (arcmin). Botón **VizieR** junto a SIMBAD. Tests 58→68 GREEN (parser reproduce la geometría real de NGC1560: 9.55′×1.70′ PA 21 desde muestra sintética). **⚠️ Validación en vivo PENDIENTE: los servidores de VizieR están CAÍDOS ahora (503 / "database not reachable" — outage de su lado), no es nuestro código.** La capa defensiva hace que el botón diga "VizieR falló" hasta que revivan. **NED descartado** (evidencia: cone 10′ en Abell 39 → 2794 objetos, sin columna de tamaño, y con filtro mag≤16 solo quedan estrellas/duplicados → aporta ~nada sobre SIMBAD). |
| 22 | 2026-07-05 | 1.0 | **#13 — online SIMBAD: checkbox → botón (grupo de surveys).** (Petición usuario, tras confirmar en GUI que NetworkTransfer funciona.) `analyze()` refactorizado a `doAnalyze(source)`; el checkbox `st.online` se sustituye por un grupo *"Buscar en surveys online:"* con el botón **SIMBAD** (`addSurveyButton(text,source,tip)` → `doAnalyze(source)`), preparado para añadir más botones. Estado: *"· +N de SIMBAD"*. Pendiente: definir qué otros surveys (fuentes de catálogo VizieR/NED vs surveys de imagen del mapa Aladin). |
| 21 | 2026-07-05 | 1.0 | **#13 Fase B — consulta ONLINE a SIMBAD (híbrido).** Toggle "Buscar online (SIMBAD)" en Objetos del catálogo: al Analizar, además del catálogo local consulta SIMBAD TAP el campo y añade objetos DSO que faltan. Motor (`annotations.js`): `optAnnDownloadText` (HTTP síncrono con **NetworkTransfer**, patrón oficial de `Ephemerides/CoordinateSearchDialog.jsh`), `optAnnBuildSimbadUrl` (cone-search ADQL, `format=tsv`, **filtro anti-flood** `galdim_majaxis >= 0.5′` + whitelist de otype + `TOP 500`), `optAnnSimbadOtypeToCat` (otype SIMBAD→categoría), `optAnnParseSimbadTsv`, `optAnnDedupByPosition` (evita duplicar NGC/IC que SIMBAD también trae, tol 1′). Refactor: geometría de elipse extraída a `optAnnPlaceObject` (reutilizada local+online). Defensivo: si falla red/timeout/TSV, quedan los locales (`res.onlineError`). Verificado con curl: cone 0.5° en Abell 39 → 74 objetos crudos vs **8 con filtro**; NGC1560 → 1 (dedup). Tests 42→58 GREEN (otype, URL, parser TSV, dedup). **Pendiente: validar en GUI que NetworkTransfer funciona dentro de PixInsight** (curl del sandbox sí, pero el runtime de PI puede diferir por SSL/proxy). |
| 20 | 2026-07-05 | 1.0 | **#13 Fase A — cobertura de catálogo ampliada (Abell PNe + Sharpless).** Abell 39 no se detectaba porque NO está en OpenNGC (verificado por nombre y coords). Los "surveys" de Aladin son solo imagen de fondo, no detectan objetos; lo que detecta es el catálogo. Nuevo `catalogs/extra.csv` (399 obj: **86 planetarios de Abell** + **313 Sharpless Sh2**) obtenido de **SIMBAD TAP** (coords J2000, dims `galdim_*`, convertido a formato OpenNGC `;`-separado con un script node). `optAnnLoadCatalog` ahora concatena `extra.csv` tras NGC+addendum. Abell 39 → PN, 16:27:33.7 +27:54:33, 2.9′. Tests 36→42 GREEN (Abell 39 presente/categoría/coords/tamaño + Sharpless). **Limitación:** solo 84/313 Sharpless traen tamaño de SIMBAD (el resto sale como círculo) → backfill de diámetros pendiente (VizieR VII/20 estaba en 503). **Fase B pendiente:** consulta online VizieR/SIMBAD del campo. Pendiente: validar en GUI (re-ejecutar el script recarga el catálogo). |
| 19 | 2026-07-05 | 1.0 | **#13 — sub-desplegables por categoría (subtipos estilo SetiAstro, agrupados).** Engine: `OPT_ANN_SUBTYPES` (códigos Type por categoría), `OPT_ANN_TYPELABEL` (nombres ES) y `optAnnSubtypeActive(o, subActive)` (filtro puro). UI (Objetos del catálogo): cada categoría con >1 subtipo muestra una **flechita ▾** a la derecha que despliega/colapsa inline sus subtipos (checkboxes indentadas, ocultas por defecto vía `optSetControlVisible`); al togglear un subtipo se filtra el overlay. Filtro añadido en `paintOverlay` (`optAnnSubtypeActive`). Tests: 28→36 GREEN (8 nuevos: mapeo inverso de subtipos, nombres legibles, filtro). Categorías mono-subtipo (PN/SNR/OCl/GCl/DrkN) sin flechita. Pendiente: validar en GUI. |
| 18 | 2026-07-05 | 1.0 | **#13 — ancla de etiquetas pegada a la elipse.** La etiqueta se colocaba en `cx + semieje‑mayor` en horizontal recto (ignoraba la orientación) → en galaxias grandes/diagonales el texto quedaba lejos a la derecha. Ahora se ancla en la **punta del eje mayor** (usa `mux/muy`) → toca el borde. Objetos pequeños (círculo) sin cambios. |
| 17 | 2026-07-05 | 1.0 | **#13 refactor — EL bug de los chips de imágenes disponibles.** La RGB seguía sin salir en Anotaciones porque `refreshWorkflowButtons` (dialog.js) refrescaba los chips de imágenes de preTab/stretch/post/cc/imgEnh **pero NO de annotTab** → los chips del preview de Anotaciones nunca se actualizaban. Añadido `annotTab.preview.refreshButtons()`. Con esto + la disponibilidad (build 16), la imagen de trabajo ya debe aparecer como chip clicable. Pendiente: validar en GUI. |
| 16 | 2026-07-05 | 1.0 | **#13 refactor — herencia de imágenes robusta (la RGB seguía sin aparecer).** El memory bar ya salía (build 15) pero la imagen de trabajo no llegaba. Ahora: (1) `setRecord` marca `OPT_TAB_ANNOT` para **cualquier** imagen committed (fuera del bloque solo-POST); (2) `OPT_TAB_ANNOT` añadido también en `sendActiveToStretch`/`sendActiveToImageEnh`; (3) **clave:** al ENTRAR en Anotaciones (`onTabChanged`), se marcan disponibles **todas** las imágenes con vista válida (`keysWithValidView`) + `annotTab.refreshSelections()` + `refreshWorkflowButtons()` → la imagen con la que trabajas aparece en la barra de disponibles y en los combos, venga del flujo que venga. Pendiente: validar en GUI. |
| 15 | 2026-07-05 | 1.0 | **#13 refactor — fixes de layout + herencia de imágenes (feedback usuario).** (1) **Faltaba `leftContent.sizer.addStretch()`** al final de `configureAnnotTab` (todas las pestañas lo tienen) → causaba secciones dispersas + etiquetas infladas; añadido. (2) **Estrellas (Gaia) fusionado dentro de "Objetos del catálogo"**; **Analizar** movido al final con estilo CTA (`optThemeApplyModuleCta`) como los demás botones de acción. (3) **Herencia de imágenes:** añadido `OPT_TAB_ANNOT` a las `store.setAvailable(...)` (dialog.js `sendActiveToPost`/`publishFinal`, tabs_core.js `setRecord`) → las imágenes estiradas/promovidas ahora aparecen en la barra de disponibles de Anotaciones. (4) Añadido `annotTab.refreshSelections()` a `refreshSelections` → los combos de "Selección de Imagen" ya se pueblan. Pendiente: validar en GUI. |
| 14 | 2026-07-05 | 1.0 | **#13 REFACTOR — Anotaciones reconstruida sobre `OptWorkflowTab`.** Ahora es una pestaña de flujo completa: hereda de forma nativa **"Selección de Imágenes" + slots de memoria + barra de imágenes disponibles + preview**, igual que las demás. La anotación se añade con `configureAnnotTab` (dialog_chrome.js construye/configura la pestaña; dialog.js la reconoce en `activeWorkflowTab`/`onTabChanged`): secciones propias via `addProcessSection`, el overlay se pinta con `preview.preview.onOverlayPaint(g, scale, scrollX, scrollY)` sobre el preview nativo (respetando su zoom/pan; coords = objeto·(bmp.width/img.width)·scale − scroll), la imagen anotada = `preview.currentView`, y **Aladin embebido** apilado en el `previewCard`. Eliminada la `optBuildAnnotationsTabPage` custom (canvas propio, Fuente combo, zoom/pan propios) — ya no hacen falta. Pendiente: validar en GUI (grande). |
| 13 | 2026-07-05 | 1.0 | **#13 feedback usuario (parcial) — elipse más grande + secciones colapsables.** (1) `OPT_ANN_SIZE_FACTOR=1.4`: la elipse se agranda 1.4× para englobar la galaxia (el MajAx del catálogo quedaba corto). (2) Panel izquierdo reorganizado en **secciones colapsables `optSection`** (Working image / Catalog objects / Stars (Gaia) / Output) como las otras pestañas; títulos i18n (3 entradas ES añadidas). **PENDIENTE (feedback pendiente):** barra de slots de memoria + selección de imagen sobre el preview (como las otras pestañas), sub-desplegables por categoría (subtipos estilo SetiAstro), selector de surveys (Aladin), e i18n completo de los strings del cuerpo. Pendiente validar en GUI. |
| 12 | 2026-07-05 | 1.0 | **#13 feedback usuario — estética/márgenes/layout como las otras pestañas.** La pestaña Anotaciones ahora usa el mismo patrón: `page` con `OPT_BG` + márgenes `Theme.s7`/`s5`; **leftCard** (surface+borde+rXl, ancho fijo 340, ScrollBox, contenido margen 6) con `optEngineTitle("ANNOTATIONS")` + `optInfoLabel`; **previewCard** (misma tarjeta) envolviendo el lienzo+WebView apilados. Controles estilizados con los helpers del tema (`optThemeApplyChannelComboStyle` en combos, `optThemeApplySliderStyle` en el slider, `optThemeApplyCheckBox` en los toggles de estrellas). Pendiente: validar en GUI. |
| 11 | 2026-07-05 | 1.0 | **#13 feedback usuario — Aladin EMBEBIDO en la zona de preview.** El mapa del cielo ya no abre un diálogo modal: el WebView de Aladin se apila con el lienzo en la zona derecha (`rightBox` + `VerticalSizer`, toggle con `optSetControlVisible`). El botón alterna "Mapa del cielo (Aladin)" ↔ "Volver a anotaciones". Al re-analizar se vuelve al lienzo. Quitado `canvas.setFixedSize` (llena el hueco) y la clase `OptAnnSkyMapDialog` (código muerto). **VALIDADO EN GUI:** Aladin aparece embebido en la zona de preview (DSS + footprint dorado) y el toggle vuelve al lienzo. (Cosmético menor: queda un margen negro a la derecha del lienzo al no fijar su tamaño.) |
| 10 | 2026-07-05 | 1.0 | **#13 feedback usuario — sistema de imágenes del flujo + orientación de elipse.** (1) **Fuente desde el store:** nuevo selector "Fuente" en Anotaciones poblado con `dlg.store.keysWithValidView()` (mismas imágenes que las otras pestañas); se refresca al ENTRAR en la pestaña (hook en `onTabChanged`, dialog.js) → una imagen recién estirada queda disponible para anotar. `analyze()` usa la fuente elegida (o "Imagen activa" de reserva). (2) **Orientación de elipse:** se dibuja como **polígono** orientado por el vector unitario del eje mayor (`mux,muy` calculado en el motor desde el norte/este locales), eliminando la ambigüedad del sentido de `rotateTransformation` que daba la orientación equivocada. **VALIDADO EN GUI:** la elipse de NGC1560 ahora sale **diagonal, alineada con la galaxia de canto** (antes horizontal); el selector "Fuente" aparece poblado (con "Imagen activa" de reserva cuando el store del flujo está vacío). |
| 9 | 2026-07-05 | 1.0 | **#13 pulido — color del nombre = color del marker (feedback usuario).** El texto de cada etiqueta usa exactamente el color con que se identifica el objeto (color de categoría, o blanco si está seleccionado), no solo por categoría sino también en el caso seleccionado (antes el marker se ponía blanco pero el nombre seguía coloreado). |
| 8 | 2026-07-05 | 1.0 | **#13 pulido — leyenda de categorías.** `paintOverlay` dibuja una leyenda (esquina sup. izq., solo categorías presentes + estrellas) con fondo semitransparente; posición fija con zoom/pan y se incluye en la imagen exportada (autoexplicativa). **VALIDADO EN GUI:** leyenda visible (Galaxias / Estrellas/asterismos / Estrellas (Gaia)) con sus colores sobre Image02. |
| 7 | 2026-07-05 | 1.0 | **#13 pulido — color real de estrellas + export de imagen anotada.** Refactor: dibujo del overlay extraído a `paintOverlay(g, disp, offX, offY)` (reutilizado por el lienzo y la exportación). Checkbox **"Color real (BP-RP)"** (anillos en color de la estrella vs cian). Botón **"Guardar imagen anotada"** → render a ~2400px con el overlay quemado → `Bitmap.save()` a PNG/JPEG (usa `SaveFileDialog.filePath`). **VALIDADO EN GUI:** toggle color-real alterna anillos cian↔BP-RP; export genera un PNG 2400×1351 con la elipse de NGC1560, etiquetas y los 164 anillos cian de estrellas correctamente quemados. |
| 6 | 2026-07-05 | 1.0 | **#13 Fase 3 (zoom/pan) + Fase 4 (mapa Aladin) + estrellas como círculos.** Estrellas Gaia ahora se dibujan como **anillos** (círculos), tamaño constante en pantalla. **Zoom/pan del overlay** (`onMouseWheel` centrado en cursor, arrastrar=pan, doble clic=reset; coords vía `disp = scale*zoom + pan`, fondo con `drawScaledBitmap`). **Mapa del cielo (funcionalidad B):** botón "Mapa del cielo (Aladin)" → `optAnnSkyMapHTML` genera Aladin Lite v2 (canvas 2D, validado Fase 0) centrado en el campo con el **footprint** de la imagen (4 esquinas) dibujado; `OptAnnSkyMapDialog` (WebView modal + fallback navegador). **VALIDADO EN GUI (build 6):** estrellas Gaia como **anillos cian** claramente visibles (164 sobre NGC1560); zoom con rueda centrado en cursor OK; mapa Aladin abre mostrando el atlas DSS con NGC1560 y el **footprint dorado** enmarcándola. (El color real BP-RP de la estrella se guarda en `s.color` para un modo "color real" futuro.) |
| 5 | 2026-07-05 | 1.0 | **#13 Fase 2 — capa de estrellas (Gaia).** `optAnnQueryStars` (motor Gaia on-board por región, magnitud-gated + cap de fuentes; patrón de `optSSSCQueryGaiaSpectra`) + `optAnnStarColor` (color por índice BP-RP). UI: checkbox "Estrellas (Gaia)" (carga perezosa al activar, `processEvents` para el "Consultando…"), dibujadas como puntos coloreados bajo los markers DSO, filtradas en vivo por el slider de profundidad. Sin etiquetas (evita saturación; las nombradas quedan para después). Pendiente: validar en GUI. |
| 4 | 2026-07-05 | 1.0 | **#13 — markers dimensionados al objeto (feedback usuario).** Antes el círculo solo marcaba el centro; ahora se dibuja una **elipse escalada** al tamaño real del objeto (adoptando la fórmula de AnnotateImage: semieje px = (MajAx/2)/resolución, `axisRatio = MajAx/MinAx`, rotación por `PosAng`). Parse añade `MinAx`/`PosAng`; la geometría (aPx/bPx/paRad) se calcula en `optAnnQueryImage` con el norte/este locales vía `celestialToImage`; la etiqueta se ancla al borde de la elipse. Objetos sin tamaño → círculo pequeño. |
| 3 | 2026-07-05 | 1.0 | **#13 Fase 1 — Anotaciones (motor + pestaña MVP DSO), VALIDADO EN GUI.** `engine/annotations.js` (parse/clasificación/query FoV/filtro magnitud/declutter; node test GREEN 28/28) + `ui/sections_annotations.js` (pestaña autocontenida: analizar imagen resuelta → overlay OpenNGC con markers+etiquetas, slider de profundidad, toggles por categoría, desplegable). Cableada antes de Configuration tras `OPT_ANNOTATIONS_ENABLED`; i18n "Annotations"→"Anotaciones". **GUI (imagen RGB real del usuario):** la pestaña renderiza en ES, "Analizar" carga el catálogo (12.952 obj), calcula FoV (0.75°), pinta la imagen con auto-stretch y coloca los markers **exactamente sobre las galaxias**; toggle de categoría filtra el overlay en vivo. **Fix durante validación:** `#__FILE__` resuelve a `engine/annotations.js` (no al script principal) → `optAnnCatalogDir` sube una carpeta para hallar `catalogs/`. Pendiente: estrellas (Gaia, Fase 2), zoom/pan del overlay (Fase 3), mapa Aladin v2 (Fase 4), export anotado. |

## ESTADO (checkpoint 2026-06-29) — plan F1–F7 + F3-full + F6-v2 COMPLETO
Todas las fases con v1 entregado y GUI-validado. **Harness 54 checks GREEN** (baseline
recapturada el 2026-06-29 al añadir `analysis_defaults` y `autoghs_preserve`). Además:
fix del colapso inicial de secciones en Pre (`applyUiMode` ya no re-expande) y AutoGHS
saturación damping (`OPT_AUTOGHS_SATURATION=0.92`, ver autoghs.js). **UI Stretching (2026-06-29):**
STARS ahora usa **AutoGHS por defecto** (reorden en optBuildStretchZone + canon de wireStretchZone)
con defaults Stretch Int 0.7 / Iterations 10; RGB/STARLESS tiene un slider **Saturation** (0–1,
default 0.95) que pasa `aghs_saturation` (STARS sin slider → fijo 0.92). `Dev_194` intacto. **Nada
publicado.** Módulos nuevos: `diag, session, ui_mode, recipes, metrics, export, masks,
defaults`. Funciones nuevas de usuario en la pestaña **Configuration** (Save/Load Preset ·
Measure Quality · Mask Maker+Librería · Diagnostics) y en la barra (botón dorado toggle
**Simple** [`optThemeApplyGoldenToggle`] · botón **Export As…**) y en **Pre** (botón **CabraMagic** +
selector **Intensity** [solo en Simple] · botón **Suggest Defaults from Image** [solo en Advanced]).
**UPDATE 2026-06-30:** la pestaña Configuración se adelgazó (petición usuario): quitadas las
tarjetas Workflow Presets, Image Quality, Mask Maker y Diagnostics (sus motores siguen:
session/metrics/masks/diag.js — diag sigue registrando errores; nada se rompe). Las **métricas
de calidad ahora viven en la línea de estado** bajo cada preview (`OptPreviewPane.updateQualityStatus`,
panels.js), refrescándose al cambiar de imagen (gateado por id de vista). Config queda = solo los
menús de habilitación de algoritmos (colapsados al abrir).

**UPDATE 2026-07-01 (Channel Combination — blend Photoshop):** dos fixes en
`engine/channel_combination.js`. (1) **Corrección:** `optCcBlendExpression` devolvía la mezcla de
opacidad `A*(1-op)+(expr)*op` **sin paréntesis englobantes**; en el preview live "See all Images
Blended" esa cadena se anidaba como fondo `A` de la capa superior y la precedencia la rompía en
todos los modos que usan `A` en contexto multiplicativo/sustractivo (Screen, Multiply, Overlay,
Colour burn/dodge, …) → el preview divergía del resultado aplicado siempre que una capa inferior
tenía opacidad < 1. La ruta Full (secuencial, un PixelMath por capa) SIEMPRE fue correcta, así que
los resultados aplicados nunca estuvieron mal — solo el preview. Fix = envolver la mezcla en
paréntesis (verificado numéricamente: 4/4 casos coinciden con la verdad). (2) **Simplificación:**
`optComposeCcSlots` tenía dos rutas (live = una expresión PixelMath anidada única; full =
secuencial). La anidada crecía **exponencialmente** (6 capas Overlay = ~94 KB de expresión, 4.096
lecturas de `$T`). Se eliminó la rama live; ahora **ambas usan la ruta secuencial progresiva** →
preview == resultado final (WYSIWYG), sin explosión de expresión, y la caché de merge progresiva
funciona también en live (arrastrar una capa recomputa solo esa y las de encima). −~55 líneas.
Harness: solo cambia `cc_blendExpr[26]` (Screen@0.5, hash `2554794244`→`425930628`), baseline ya
recapturada a mano (recomputada con la función real). **Pendiente: validar en GUI** (apilar 3+
capas con opacidad<1 y modos Screen/Multiply/Overlay → preview coincide con "To Image Enhancement").

**UPDATE 2026-07-01b (Channel Combination — máscara = máscara de capa Photoshop):** cambio de
semántica de la máscara por-slot (petición usuario). ANTES: la máscara limitaba los AJUSTES propios
del slot (brillo/color/saturación/curvas) a las zonas blancas y NO afectaba a la mezcla (con ajustes
por defecto, la máscara no hacía nada). AHORA: la máscara modula la APORTACIÓN de la capa al
composite como alpha por-píxel (`alpha = opacidad·máscara`): blanco = capa al 100%, negro = se ven
las capas de debajo, gris = opacidad parcial — igual que una máscara de capa en Photoshop. Los
ajustes del slot pasan a aplicarse a TODA la capa. Impl.: `optCcBlendExpression` acepta `maskId`
opcional (`(A*(1-a)+(expr)*a)`, `a=op·mask`; sin `maskId` = ruta escalar de siempre, harness intacto);
`optPrepareCcSlotView` ya no engancha la máscara (quita `slotMaskApplied`/`optClearProcessMask`);
`optComposeCcSlots` resamplea un clon de la máscara a la geometría de composición (para live reducido)
y la referencia en el PixelMath de cada capa. La máscara del slot BASE (canvas) se ignora, como su
blend/opacidad. Verificado numérico: mask 0→base, 1→mezcla plena, 0.5→intermedio (6/6). Harness: +2
fingerprints en `cc_blendExpr` (rutas con máscara, idx 28/29), baseline recapturada a mano; las 28
previas idénticas. Tooltips (`combo.Mask:`/`label.Mask` ES+EN) actualizados; help.xhtml NO tocado.
**Pendiente GUI:** máscara mitad blanca/negra en una capa Screen → mitad mezcla, mitad base.

**UPDATE 2026-07-01c (quick wins del análisis de menús — #2 y #4):** limpieza de bajo riesgo (UI, sin
tocar funciones puras → harness intacto). **#2 (dedup Compare):** `optCompareGradientCorrection` y
`optCompareColorCalibration` (ui/tabs_core.js) eran casi-duplicados del driver genérico `optCompareCombo`
(~200 líneas); ahora son wrappers finos que delegan en él. Para permitir Color Calibration (no tiene
combo, son tarjetas de acción) el driver se hizo **tolerante a `combo:null`** (guardas en originalIdx /
maxItems / currentItem). El wrapper de gradiente cierra el clon candidato en `runOne` porque los motores
de gradiente devuelven una vista NUEVA (MGC/ABE/AutoDBE/GraXpert) — el driver solo libera la vista
devuelta, así que sin ese cierre se fugaría el candidato. Color Calibration corre in-place → devuelve el
candidato y el driver lo libera. **#4 (des-hacks):** (a) `OptPreviewScheduler` (ui/store.js) ya no usa
`typeof BigInt !== 'undefined'` como proxy de "motor moderno" (Dev_200 es V8-only; `Date.now()` es
universal) → mide y adapta el debounce siempre; (b) los tooltips por-motor de "Den. Color" en Post NR
(NXT/Cosmic Clarity) ya no se reasignan a mano — usan el helper existente `optApplyNumericTooltipKey(nc,
key)`. Los 3 ficheros pasan `node --check`. **#1 (caché de Compare) NO hecho:** resultó más grande de lo
estimado — la `signature` que Compare guarda es SIN parámetros y la firma con parámetros
(`optMemoryJoinSignature`) se calcula DENTRO del motor tras ejecutar, así que "saltar si no cambió"
necesita surfacear una huella de params al nivel de Compare (medio esfuerzo). Diseño propuesto: callback
`itemSignature(idx)` en `optCompareCombo` + fuente única de la lista de widgets de firma. Pendiente de OK.

**UPDATE 2026-07-01d (más mejoras del análisis — lote #5/#2b/#10/#7):** cuatro ítems contenidos, TESTEADOS
(node --check en los 6 módulos + **harness real de PixInsight GREEN 59/59** — valida que TODO el script
carga con los cambios y ninguna función pura cambió + equivalencia de dispatch 18/18 en node). NADA en
el harness (todo es motor de disponibilidad/UI). **#5 (memoizar sondas):** `optDependencyProcessExists`
(engine/utils.js) cachea en `OPT_DEP_EXISTS_CACHE` (existencia de proceso = estable por sesión; se llama
~15×/refresco con un `eval` de reserva). **#2b (progreso en Compare):** el driver `optCompareCombo` pinta
"Compare i/N: nombre…" en el overlay por algoritmo. **#10 (guarda de fugas GUI):** nuevo
`optDiagScanTempLeaks(stage, prefixes)` (engine/diag.js, log-only, cuenta por NOMBRE no por total → no da
falsos positivos con las vistas de memoria/salidas que sí deben persistir); cableado al final de
`optCompareCombo` (prefijo `Opt_Compare_`) y de `optCabraMagicRun` (`Opt_CC_`/`Opt_Gray`/`Opt_Compare_`).
**#7 (dispatch por id):** Deconvolution (engine/pre.js) y Sharpening (engine/post.js) ya NO despachan por
regex sobre la etiqueta (`/cosmic/i`…) sino por un `id` estable — robusto a reordenar, al flag Parallax y
a renombrados/i18n. Fuente única del orden canónico: `optPreDeconCanonicalEntries` / `optPostSharpCanonicalEntries`,
consumidas por el dispatch (cfg.decon.id / cfg.sharpId) Y por la construcción del combo en
`optApplyProcessAvailabilityToUI` (ui/tabs_core.js). Verificado equivalente al viejo dispatch (18/18).
**Pendientes del lote pedido:** #1 (botón Cancel, UI+flag, medio), #9 (i18n de strings de estado, bajo),
#11 (fábrica declarativa de secciones, GRANDE — por fases, no big-bang), #12 (máscara unificada + live,
grande). GUI sin validar aún: progreso de Compare y disparo del leak-sentinel (necesitan la app abierta).

**UPDATE 2026-07-01e (#1 — Cancel cooperativo, primer incremento: Compare):** mecanismo reutilizable en
el overlay "busy" del preview (ui/widgets.js): `setBusy(active, text, cancelable)` pinta un botón ✕
(glyph, no widget) y `optInitPreviewControl` expone `isCancelRequested()`. El clic sobre el ✕ se procesa
durante el `optProcessEvents()` del bucle (hit-test en `viewport.onMousePress`, mismo espacio de
coordenadas que el hit-test de split-compare que ya funciona), pone `cancelRequested` y consume el clic
(no hace pan). El flag se resetea SOLO en el flanco de subida de `setBusy` (para que las actualizaciones
de progreso por-iteración no borren un cancel pedido a media ejecución). Cableado en `optCompareCombo`
(ui/tabs_core.js): el bucle sondea `isCancelRequested()` tras `optProcessEvents` y ANTES del siguiente
algoritmo (que puede tardar minutos) → corta limpio; las variantes ya calculadas quedan en sus slots de
memoria (comparación parcial) y el estado muestra "Compare (cancelled)". node --check OK + harness GREEN
59/59 (carga intacta). **VALIDADO EN GUI (2026-07-01, computer-use):** con una RGB real (MasterLight
6012×4803) → Gradient → Compare, el overlay mostró "Compare 1/3: MGC…" (progreso #2) + el ✕; al pulsar
el ✕ el texto pasó a "Cancelling…" y el bucle cortó tras el algoritmo en curso → resultado "Compare
(cancelled): 1/1 variants" (solo MGC quedó en memoria). Nota: hace falta clicar el ✕ mientras el overlay
está visible; si el Compare es rápido (p.ej. Gaia ya cacheada) la ventana es corta.

**UPDATE 2026-07-01f (#1 Cancel — extensión a Apply-all + CabraMagic):** reutiliza el mismo mecanismo del
overlay (setBusy cancelable + `isCancelRequested()`), cableado en dos bucles más. **Apply-all (Pre batch):**
`optApplyPreBatchToSlots` (engine/pre.js) ahora corta si su `progressFn` devuelve `false` (cualquier otro
retorno = comportamiento previo → callers antiguos intactos) y marca `result.cancelled`; `optRunPreApplyAll`
(ui/tabs_core.js) abre el overlay cancelable, y su callback hace `optProcessEvents()` + devuelve
`!isCancelRequested()` → aborta antes del siguiente slot; el estado muestra "Apply all (cancelled)".
**CabraMagic (single-image):** `stage()` (engine/cabramagic.js) gana un corte *gated*: SOLO si el caller
pasa `opts.shouldCancel` cede el hilo (`optProcessEvents`) y para entre etapas (marca `report.cancelled`);
headless/harness no pasan `shouldCancel` → stage() byte-idéntico. `runCabraMagic` (ui/dialog.js, ruta
single-image) abre overlay cancelable + pasa `shouldCancel`, y si `report.cancelled` **descarta** el
finalView2 parcial (no promueve a "Final") + avisa. La ruta multicanal (`optCabraDispatch`) queda sin cancel
por ahora (mayor superficie). node --check (4 ficheros) + harness GREEN 59/59. Mecanismo ya GUI-probado en
Compare; Apply-all/CabraMagic reusan idéntica lógica (validación GUI específica pendiente/opcional).
Siguiente: **#9 (i18n)** → **#11 (piloto)** → **#12**.

**UPDATE 2026-07-01g (#9 — i18n de strings de estado, ACOTADO):** `optT()` (runtime, lookup en
`OPT_I18N_ES`) ya existía; añadí entradas ES en `PI Workflow_resources.jsh` y envolví las **superficies
visibles** de estado transitorio: progreso por-ítem de Compare (`optT("Compare") + " i/N: nombre…"` →
"Comparar 1/3: MGC…"), la **línea de estado final** de Compare (variantes/hint/"(cancelled)"), el overlay y
estado de **Apply-all**, el busy de **CabraMagic** (2 sitios), el default **"Working"** del overlay
(ui/widgets.js) y los overlays de **panels.js** (upgrade/export). **Acotado a propósito:** la busyText
inicial de Compare ("Compare: running…") apenas se ve (el bucle la reemplaza al instante) y los
busyText/doneText/errorText de las **Live previews** (9 strings en 3 ficheros) se dejan en inglés —
retorno decreciente; se pueden envolver igual (optT + entrada ES) si se quiere el pase completo. node
--check (5 ficheros + cuerpo del resources) + harness GREEN 59/59. Nota: los mensajes de **consola**
(`console.writeln`) siguen en inglés a propósito (log técnico). Siguiente: **#11 (piloto)** → **#12**.

**UPDATE 2026-07-02 (lote: UX + log de procesado + CabraMagic V2):** todo TESTEADO (node --check +
harness GREEN 59/59 ×2 + **smoke funcional nuevo `_tests/cabra_v2_smoke.js` GREEN 9/9**).
**UX-1 (Load Image Files…):** botón en Image Selection (ui/panels.js, OptSelectionPanel) que abre
OpenFileDialog multi-selección + ImageWindow.open + refresh de combos — el diálogo es modal y antes
había que cerrarlo para cargar imágenes. **UX-3 (Fast drag):** checkbox en el footer de CC
(`dlg.chkCcFastDrag`, sections_enh_cc.js): live blend a resolución de preview (optCcLivePreviewMaxDim)
en vez de full-res; commit sigue full-res vía upgradeFn; al togglear invalida caches live.
**PROC-LOG (comunidad):** nuevo `engine/processing_log.js` + botón "Log…" en la barra
(dialog_chrome.js). Genera .txt (descripción AstroBin/foros: adquisición del header FITS + WBPP/
ImageIntegration HISTORY parseado + etapas del store en orden) + `_astrobin.csv` (formato oficial
import: date,number,duration,binning,gain,sensorCooling; `filter` omitido — AstroBin exige su id
numérico de equipo; notas de sospecha si EXPTIME parece total) + **embed en la imagen** (HISTORY
keywords troceadas "PIW|…" portables FITS/XISF + propiedad `PIWorkflow:ProcessingLog`). Unit-tests en
node (parseo WBPP/CSV/texto) PASS.
**CABRAMAGIC V2 (P1–P4):**
- **P1 (unificación):** la ruta single-image (`optCabraMagicRun`) ahora hace **star split + dual
  stretch** (SXT/StarNet vía optCabraMakeStarless → stars=view−starless → AutoGHS starless con
  fp.stretchIntensity adaptativo + star-reduce residual + denoise → StarStretch stars → screen
  recombine in-place). Sin motor → stage lanza y cae al camino legacy intacto (denoise lineal +
  AutoGHS + reducción morfológica). `opts.noSplit=true` lo desactiva.
- **P2 (orden canónico):** nuevo finisher compartido `optCabraFinishView(view,dialog,fp,o)`
  (SCNR → **vibrance** (sat enmascarada por diseño) + saturación plana contenida → gamma a lumTarget
  → **S-curve sigmoid suave** (la "curva" que faltaba) → **optCabraSetBlackPointSoft** (knee suave,
  no clip — preserva IFN) → detalle edge-aware opcional). Ambas rutas lo usan; en la multicanal el
  denoise se movió al **starless recién estirado** (antes iba al final, tras el detalle) y se quitó
  el denoise final.
- **P3 (auto-QA):** el finisher mide su salida con optQualityMetrics y corrige UNA vez (re-target de
  brillo si mediana desvía >35%; TameHighlights si clipping >0.25%). Log "CabraMagic QA: …".
- **P4 (FORAXX):** `optCabraCombinePalette` acepta "FORAXX" (dinámica pública: G = (HaO)^~(HaO)
  blend, R dinámico con SII; **ojo: PixelMath NO tiene pow(), es el operador ^** — descubierto por el
  smoke). Añadida a las paletas del dispatch (ui/dialog.js): NB ahora ofrece HOO/SHO/FORAXX.
- Fingerprinted intactas (BuildRecipe/DenoiseChoice/NbAddWeight/SetBlackPoint duro). El smoke
  verificó: 7/7 etapas ok (split real con motor instalado), mediana 0.19, 0% clip, FORAXX en rango,
  **0 fugas de ventanas**. Pendiente GUI: A/B visual con imagen real (RGB_LDu_2) y validar los 3
  candidatos NB.

**UPDATE 2026-07-02b (CabraMagic V2 — VALIDADO EN GUI CON DATOS REALES + fix SPCC-fallback):**
validación conducida por computer-use en una **segunda instancia** de PixInsight (la sesión de trabajo
del usuario con Collinder 34 quedó intacta; nota: `SetForegroundWindow` necesita el truco ALT/keybd_event
para robar foco entre instancias). RGB_LDu_2.xisf (6012×4803, campo de polvo tenue SNR~3.6) → Simple →
CabraMagic. **Resultado (~2 min total):** consola = "Ran: background, sharpen (BXT), **star split + dual
stretch**, structure, finish (colour/contrast/QA) — **CabraMagic QA: within gates (median 0.121, clipped
0.00%)**". Visual: estrellas pequeñas CON color (azules/naranjas), fondo neutro oscuro, polvo visible,
sin halos ni clipping. Los botones nuevos (Load Image Files…, Log…, Fast drag) renderizan. **Hueco
cazado y ARREGLADO:** SPCC falló en la instancia 2 y el pipeline quedaba SIN calibración de color (la
rama ALF+BN solo corría sin astrometría) → ahora `colorDone` solo se marca dentro del stage y si SPCC
lanza se cae a **ALF+BN** (engine/cabramagic.js). Re-verificado: node --check + smoke GREEN 9/9.
Pendiente opcional: tuning estético fino con feedback del usuario (S-curve 3.2 / vibrance / knee).

**UPDATE 2026-07-02c (RGB+H+O — feedback real del usuario: grano gordo + OIII apagado):** la ruta
`rgb_nb` ponderada (`optCabraComposeRGBNBWeighted`) tenía dos defectos confirmados con una imagen real
(región Soul, RGB+Ha+OIII): (1) **grano**: la capa NB continuum-subtraída (la resta SUMA ruido) se
estiraba y screeneaba sobre la base DESPUÉS de todo el denoise de la base → moteado grueso; fix =
`optCabraDenoiseNBAdaptive(cs)` (fuerza adaptativa por SNR 0.3–0.8) sobre la capa de línea estirada,
ANTES del screen (la base nunca se re-emborrona). (2) **OIII invisible**: el peso SNR
(`optCabraNbAddWeight`, fingerprinted, INTACTA) caía al suelo 0.10–0.20 para un OIII típico frente a un
máster RGB; fix = nueva pura `optCabraNbLineGain(line,w)` aplicada ENCIMA en addLine: OIII ×1.5 con
suelo 0.28 y cap 0.70; Ha/SII passthrough. Tests: unit node 9/9 (shaping + valores fingerprinted
intactos) + harness GREEN 59/59. Tuning fácil: gain/floor en optCabraNbLineGain.

**UPDATE 2026-07-02d (grano al FINAL del tratamiento RGB — cola noise-aware):** segundo feedback real
del usuario (Soul RGB+H+O): el OIII ya lee (fix 07-02c OK) pero el grano persistía y lo localizó "al
final del tratamiento RGB" = la cola del finisher. Causa: los AMPLIFICADORES post-denoise — structure
(contraste local), **vibrance** (potencia color débil = moteado de crominancia del fondo, el peor),
S-curve y edge-aware — re-fabrican grano en campos ruidosos; además el denoise starless V2 (0.45×1)
era más suave que el legacy (NXT 0.80×2). Fixes: (1) **finisher noise-aware**: mide SNR ANTES de
amplificar; SNR<5 → vibrance ×0.5, saturación plana ×0.6, S-curve ×0.75, edge-aware ×0.6; SNR<3 →
vibrance/edge-aware OFF; (2) **cleanup de crominancia** al final si noisy: TGV chroma-only (C=2.5,
L=0.3 — no toca detalle de luminancia; nativo, siempre disponible); (3) **structure** con el mismo gate
(SNR<5 → ×0.6); (4) denoise starless 0.45→**0.60** en las 3 rutas. Todo logueado en consola
("CabraMagic finish: SNR x.x (noisy) -> damped boosts…"). node --check + harness GREEN + smoke 9/9
(mediana 0.1798, gates OK). Los diales: umbrales SNR 5/3 y factores en optCabraFinishView.

**UPDATE 2026-07-05 (PROC-LOG sin botón — el log viaja con cada export):** petición del usuario:
quitar el botón **"Log…"** de la barra y que el registro de procesado se **incruste al exportar** (y
además genere el `.txt`/`_astrobin.csv` cuando el export va a disco). Hecho:
- **`engine/processing_log.js`:** refactor + orquestadores nuevos. `optProcLogKeywordCards(text)`
  (tarjetas HISTORY "PIW|" troceadas, compartidas) → usada por `optProcLogEmbed` (vista, workspace) y
  por el nuevo `optProcLogEmbedInstance(fInst, format, text)` (embebe en el `FileFormatInstance` de
  escritura a disco, solo si `format.canStoreKeywords`; best-effort). `optProcLogBuild(view, record)`
  = collect+text en un paso. `optProcLogWriteSidecars(imagePath, data, text)` escribe `<base>.txt` +
  `<base>_astrobin.csv` junto al fichero exportado.
- **Exportar (workspace)** `OptPreviewPane.exportCurrent` (ui/panels.js): tras clonar la vista de
  export, `optProcLogEmbed(exported, …)` → keywords HISTORY + propiedad XISF (sin fichero; no hay ruta).
- **Exportar TIF** `exportCurrentTiff` (ui/panels.js): `optProcLogEmbedInstance` en el TIFF (keywords) +
  `optProcLogWriteSidecars` al lado.
- **Export As…** `engine/export.js` (`optExportViewToFile` acepta 3er arg opcional `logText`) + handler
  en ui/dialog_chrome.js: embebe keywords (TIFF/FITS/XISF) + sidecars; el MessageBox lista las rutas.
- **Botón eliminado:** bloque `btnGlobalProcLog` + su `sizer.add` (dialog_chrome.js) y la clave i18n
  `global.procLog` (ES+EN). Tooltips `global.export`/`exportTif`/`exportAs` actualizados para describir
  el embed automático. Matiz: PNG/JPEG no persisten keywords (el `.txt` en disco cubre esos casos).
  Verificado: node --check (5 ficheros + cuerpo del resources). **Pendiente: harness + validar en GUI**
  (los 3 flujos con imagen real: keywords en el .xisf/.tif exportado, .txt/.csv al lado, y en Export a
  workspace que la propiedad `PIWorkflow:ProcessingLog` quede en la vista).

**UPDATE 2026-07-05c (i18n pestaña "Configuration" → BUILD 2):** a petición del usuario, `"Configuration":
"Configuración"` añadido a `OPT_I18N_ES` (`PI Workflow_resources.jsh`, bloque "Tab pill labels"). Cierra
la inconsistencia anotada en 07-05b. node --check OK (cuerpo resources). **BUILD 2** (`OPT_BUILD` 1→2).

**UPDATE 2026-07-05b (versionado + build + i18n pestaña 4 → BUILD 1):** tres cosas pedidas por el
usuario. (1) **Versionado con trazabilidad de builds** (ver sección "VERSIÓN Y BUILDS" arriba): nuevos
`OPT_BUILD`/`OPT_BUILD_DATE` junto a `OPT_VERSION` en `PI Workflow.js`; **la versión la cambia solo el
usuario, el build lo incremento yo en cada modificación**. La cabecera (`optBuildWorkflowTitleBar`,
dialog_chrome.js) muestra ahora **versión · fecha · build** (`1.0  ·  2026-07-05  ·  build 1`) + pill
OPTIMIZED. (2) **Versión 0.9 Beta → 1.0** (`OPT_VERSION` + comentario de cabecera del fichero). (3)
**Pestaña 4 "Image Enhancement" → "Mejora de Imagen"** en ES: faltaba la entrada en `OPT_I18N_ES`
(`PI Workflow_resources.jsh`, bloque "Tab pill labels"); se traduce vía `optI18nLabel` como el resto.
Nota: la pestaña **"Configuration"** sigue en inglés (no estaba en el encargo; entrada trivial si se
quiere: `"Configuration": "Configuración"`). node --check OK (main con directivas stripped + dialog_chrome
+ cuerpo resources). **Pendiente GUI:** ver la cabecera y la pestaña en ES. **Este es el BUILD 1** del
nuevo esquema; el próximo cambio será build 2.

## RETOMAR AQUÍ — handoff 2026-07-01 (leer esto primero al continuar)
**Estado:** todo limpio y **harness GREEN 59/59**; `Dev_194` intacto; nada publicado. Hoy (ver notas
`UPDATE 2026-07-01 a..g` arriba): fixes + **máscara estilo Photoshop** en Channel Combination; **análisis
de menús** completo; y del lote pedido por el usuario — **#5** (memoizar sondas), **#2** (dedup Compare +
progreso), **#4** (des-hacks BigInt/tooltips), **#7** (dispatch por `id` decon/sharp), **#10** (guarda de
fugas GUI), **#1** (botón Cancel ✕, **GUI-validado en Compare**) + **extensión** a Apply-all y CabraMagic,
**#9** (i18n acotado) — todos HECHOS y testeados (node --check + harness).

**PENDIENTE (por orden acordado):**
- **#11 — fábrica declarativa de secciones.** Decidido: **piloto en Deconvolution primero** (bajo riesgo),
  y con la fábrica probada aplicarla luego a **Noise Reduction**. Alcance elegido: *estructura + params
  declarativos*. Diseño de `optBuildDeclarativeSection(dlg, tab, spec)`:
  `spec = { title, buttons, info, comboProp, comboStyle, syncProp, syncBy:"label"|"index",
  groups:[ { prop, container:"plain"(Control+VerticalSizer con subcards) | "innerGroup"(plano),
  show:{match:[regex] | index}, subcards:[ {title, params:[ {type:"numeric"|"checkbox"|"combo", prop, label,
  min,max,def,prec,width, theme, tooltipKey, items, checked} ]} ], onBuilt(dlg,group) } ] }`. Debe
  reproducir la sección EXACTA (mismos props `dlg.*` que lee el motor, mismo theming/tooltips, subcards) y
  validarse con harness (carga) + **GUI panel por panel**. **Decon** (piloto): grupos `preBxtGroup`
  (subcards Stars/Nonstellar/Output), `preParallaxGroup` (condicional a `OPT_PRE_PARALLAX_ENABLED`),
  `preCCSharpGroup` (combo "shim" del modo CC). **NR** (después): 6 motores en `optInnerGroup` planos +
  `onBuilt` para `updateNxtUiStates` (enables color/freq) y el toggle AMP de Prism. Props del motor: los
  leen `optBuildPreBlurXConfigFromControls` / `optBuildPreCosmicClarityConfig` /
  `optBuildPreParallaxConfigFromControls` (Decon) y `optBuildPost*ConfigFromDialog` (NR).
- **#12 — máscara unificada + live.** Extender el modelo de máscara de capa (ya en Channel Combination) a
  Post e Image Enhancement con el mismo preview/librería.
- **#13 — Pestaña "Anotaciones" (feature grande, APARTE — gated para release).** Nueva pestaña ANTES de
  Configuration con dos funcionalidades: **(A) "Qué hay en mi imagen"** — anotación/clasificación de objetos
  del preview al estilo del *What's In My Image* de SetiAstro pero simplificado: agrupación por categorías
  (galaxias, nebulosas, cúmulos, PN, estrellas…), desplegable para seleccionar objeto en detalle, y **slider
  de profundidad** (magnitud → más profundidad = más objetos). **(B) Mapa del cielo** — la imagen embebida en
  un atlas total con zoom in/out para contexto de localización (estilo Aladin, como en *CabraSpace Imaging
  Workflow*). **Diseño recomendado (informe 2026-07-05, ver abajo):** catálogo DSO **local** (OpenNGC CSV
  empaquetado, clasificado por su columna `Type`) + proceso **Gaia** on-board para estrellas (patrón ya usado
  en `engine/sssc.js`, `optSSSCQueryGaiaSpectra`); overlay transparente sobre el preview usando
  `window.imageToCelestial` / `window.celestialToImage` (nativos). **Riesgo #1 = sobrecarga de etiquetas**:
  mitigación = markers ≠ labels, declutter greedy con anti-solape + cap N, LOD por zoom, toggles por categoría
  (estrellas OFF por defecto), y el desplegable como acceso al detalle sin saturar el lienzo. Mapa del cielo:
  **Aladin Lite embebido en un control `WebView`** (existe en PJSR — usado en CoreIconsBrowser vía
  `loadContent(htmlLocal)`; Chromium/WebEngine ejecuta JS) con **fallback garantizado** a "abrir en navegador"
  (`optOpenPathWithSystemViewer`). Módulos nuevos autocontenidos: `engine/annotations.js`, `engine/skymap.js`,
  `ui/sections_annotations.js`, `catalogs/OpenNGC.csv`, opcional `vendor/aladin/`. Flag maestro
  **`OPT_ANNOTATIONS_ENABLED`** (espejo de `OPT_IMG_ENH_ENABLED`). **Prototipos previos obligatorios (Fase 0):**
  (a) spike de red/WebGL en el WebObserver para Aladin; (b) parse+filtro FoV+clasificación de OpenNGC headless;
  (c) mapeo de coords del overlay sobre el preview real.
  **Decisiones del usuario (2026-07-05):** (1) Mapa Aladin = **embebido en WebView + fallback a navegador**
  (empezar por el spike de red/WebGL). (2) Alcance v1 = **DSO primero** (OpenNGC; estrellas Gaia y mapa en
  fases siguientes). (3) Catálogo = **híbrido**: local OpenNGC por defecto + botón opcional online
  (VizieR/SIMBAD) en fase posterior; NO bloquear v1 con la red.
  **FASE 0 — spike (a) RESUELTO (2026-07-05, ejecutado en GUI vía computer-use, `_tests/spike_webview_aladin.js`):**
  el `WebView` de PixInsight (Qt WebEngine) **ejecuta JavaScript y TIENE red** (CDN del CDS carga OK), **pero
  NO expone WebGL** → **Aladin Lite v3 (exige WebGL2) NO arranca embebido**. **SOLUCIÓN VALIDADA: Aladin Lite
  v2 (canvas 2D, requiere jQuery) SÍ renderiza embebido** — probado con M42/Orión: HiPS DSS pintando, footprint
  (overlay `A.polygon`) dibujado, controles de zoom/pan operativos. ⇒ **Ruta A (embebido) VIABLE por la vía
  v2**; el fallback a navegador (que sí tiene WebGL/v3) queda como botón "Abrir en navegador". **Notas de
  implementación del spike (aplican al módulo real):** el script debe ir en **IIFE** (v8 conserva el scope
  global entre ejecuciones → redeclaración) + **clase ES6 `extends Dialog` con `super()`** (el patrón
  `__base__` no vale en v8); `#define` numéricos dentro de template literals expandieron de forma
  inconsistente → **hardcodear/inyectar por `.replace()`, no por `#define`**; las funciones llamadas desde
  `onload` de un `<script src>` deben definirse **antes** de ese tag. Pendiente: spike (b) OpenNGC y (c) overlay.
  **FASE 0 — spike (b) RESUELTO (2026-07-05, node, `_tests/spike_openngc_analysis.js`; catálogo en
  `catalogs/NGC.csv`+`addendum.csv` descargado de OpenNGC master/database_files):** parse `;`-separado +
  RA/Dec sexagesimal→grados + clasificación `Type`→categoría + cone-search haversine, **validado**. Números:
  **12.952 objetos útiles** (excluidos Dup/NonEx/Other) → Galaxias 10.791, Estrellas/asterismos 854, Cúmulos
  abiertos 663, Nebulosas 290, Cúmulos globulares 208, PN 130, SNR 11, resto <5. **Hallazgo clave sobre el
  riesgo de saturación:** los DSO son POCOS por campo, no miles. Peor caso real (cúmulo de **Virgo**, el campo
  más denso del cielo) en radio 1.5°: solo **86 DSO totales**, y con el límite de magnitud (= slider de
  profundidad): ≤mag10→**3**, ≤12→**19**, ≤14→**39**, ≤16→**78**. En campos normales (M42/M31/M45, 1.5°): 4–11
  objetos. ⇒ **para DSO (v1) la "sobrecarga de etiquetas" NO es un problema**: el catálogo es acotado y el
  slider de magnitud basta; el declutter/LOD queda como pulido, no como necesidad. La sobrecarga real solo
  aparecerá al añadir **estrellas (Gaia)** en fase 2 → ahí sí markers≠labels + magnitud obligatorios. Nota:
  OpenNGC cubre NGC/IC+Messier+addendum pero no Sh2/LBN/LDN completos → catálogos de nebulosas extra o la vía
  online híbrida quedan para fase posterior. Pendiente Fase 0: spike (c) overlay sobre el preview (PixInsight).
  **FASE 0 — spike (c) RESUELTO (2026-07-05, ejecutado en GUI vía computer-use, `_tests/spike_overlay_preview.js`,
  sobre la imagen resuelta real del usuario NGC 1560 / Image02):** `window.celestialToImage()` es **exacto al
  píxel** — round-trip centro img (1920,1080) → RA/Dec (68.238,+71.884) → img (**1920.0, 1080.0**). Parseo de
  OpenNGC en PJSR OK (12.809 objetos), cone-search por FoV OK (encontró NGC1560 e IC2380, los 2 DSO reales del
  campo de 0.77°), overlay OK (render con auto-stretch STF sobre clon + markers por categoría + etiquetas con
  declutter anti-solape + cap N). Aprendizajes aplicables al módulo real: `view.image.render()` da un `Bitmap`
  (aplicar auto-stretch en un clon si la imagen es lineal, vía `HistogramTransformation`); los constantes con
  guion bajo (`UndoFlag_NoSwapFile`, `StdIcon_*`, `StdButton_*`) requieren `#include <pjsr/*.jsh>` en un script
  standalone. **⇒ FASE 0 COMPLETA: los 3 riesgos despejados** — mapa embebido (Aladin v2), catálogo local
  acotado (OpenNGC), y overlay preciso (celestialToImage). Listo para Fase 1 (anotación DSO MVP).

**GATING DE RELEASE (importante — acordado 2026-07-05):** el usuario querrá publicar un release **sin** estas
novedades y **sin CabraMagic**, reservándolas para releases posteriores. Todo debe quedar **detrás de flags**
para poder apagarlo con un cambio de una línea, sin borrar código:
- `OPT_ANNOTATIONS_ENABLED = false` → quita la pestaña Anotaciones por completo (a implementar con #13).
- `OPT_CABRAMAGIC_ENABLED = false` (ya existe, `engine/cabramagic.js:3`) → oculta el botón/sección CabraMagic.
- Idea: un "perfil de release" (`OPT_RELEASE_PROFILE`) que fije el conjunto de flags de novedades de golpe.
Al preparar el release "limpio": apagar ambos flags, `node --check` + harness + revisar que no quedan
referencias colgando en la UI (los flags ya se consultan con `typeof … !== "undefined"`, patrón seguro).

**Cómo testear (rápido):** `node --check` por módulo `engine/*.js` y `ui/*.js`; harness real:
`"C:\Program Files\PixInsight\bin\PixInsight.exe" -n=152 --automation-mode -r="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/regression_suite.js" --force-exit`
→ leer `_tests/regression_suite.log` (debe decir `RESULT: GREEN`, 59/59). GUI: Script Editor → EXECUTE →
Compile & Run sobre `PI Workflow.js` (el diálogo es **MODAL**); imagen de prueba RGB: `RGB_LDu_2.xisf`.

### F6 v2 (defaults por análisis) — hecho 2026-06-29, falta GUI-validar
`engine/defaults.js` (`optAnalysisDefaults(stats)`, puro) proyecta el análisis de CabraMagic
sobre los controles MANUALES: Star Reduction Strength (1:1 con `recipe.starReduce`), Detail &
Contrast → preset "By Object Type" (objType desde la clasificación; compact+C≥4.5→planetary;
intensity desde structure+detail), y Color Mixer Strength desde el SNR medido (ruidosa→suave
~0.56, limpia→pleno 1.0; NO usa `recipe.saturation`, que es constante). El applier
`PIWorkflowOptDialog.applyAnalysisDefaults()` (ui/dialog.js) setea los widgets + MessageBox;
botón en el Pre tab (ui/sections_pre_stretch.js). NO corre proceso ni toca píxeles. Todo en
bloques `ANALYSIS-DEFAULTS-*` + flag `OPT_ANALYSIS_DEFAULTS_ENABLED`. Headless: 1 check
(`analysis_defaults`, valores verificados). **Pendiente: validar en GUI** (botón renderiza +
siembra los 3 widgets con imagen real).

**PRÓXIMOS PASOS:**
1. **Validación GUI** de F6 v2 (botón "Suggest Defaults from Image" en Pre → comprobar que
   setea Star Reduction / Detail / Color Mixer) + **validación GUI holística** de Dev_200.
2. **Decisión publicar** (solo con OK del usuario): copiar Dev_200 → `OPT/Para publicar/`
   (¿modularizado con engine/+ui/, o aplanar a monolito? confirmar que `build_package.py`
   mete engine/ y ui/ en el ZIP) → `build_package.py` → git add/commit/push.
3. **O** iteraciones v2: F5-v2 (capturar/reutilizar receta),
   F7 máscara de estrellas, F3-full las 2 funciones complejas (`optCabraComposeRGB`/`NBviaRGB`).

## Red de seguridad: harness de regresión
`_tests/regression_suite.js` fija una **huella numérica determinista** de las
funciones puras/refactorables del engine (sin GPU / Gaia / herramientas externas):

- ImageOps: boxBlur, boxMin/Max, à-trous (decompose + luma), guided filter
- Color Mixer: apply completo + máscara unión
- Detail & Contrast: los 9 algoritmos (localContrast…byObjectType)
- SSSC: integrate, fit Stage 1/2/3, fotometría
- Stretch: madMidtone, auto-stretch linked
- AutoGHS: base transform (todas las ramas de b), transform normalizada, median/MAD, stretch sobre vista
- Channel Combination: las 26 expresiones de blend (hash FNV-1a) + paths de opacity
- Session (F4): capture / round-trip JSON / rechazo de ficheros ajenos / round-trip de params por-herramienta (mock dialog)
- Continuum Subtraction: slope/K-estimation/median/channel-map + subtracción mono completa
- Crop: geometría pura (clamp/fit/hit-test/resize/img→viewport) — guarda los fixes WCS-crop
- Recipe engine (F5): normalize (clamp/defaults) + resolve (override-vs-auto) + intensity (gain modula structure/star/detail/sat, preserva coreProtect)
- Quality metrics (F7): background/median/noise/SNR/saturation/dynamic-range + medianas R/G/B
- Export (F7): mapeo extensión→formato + write/readback real de un TIFF temporal
- Denoise fallback (F7): `optCabraDenoiseChoice` (NXT/Prism/TGV/NONE según disponibilidad)
- Mask Maker (F7): `optMakeMask` range + color (dispatch sobre builders tiled)
- Analysis defaults (F6 v2): `optAnalysisDefaults` (proyección stats→controles manuales; objType/intensity/SNR→colorMixer)
- Diag layer (F3-full): ring-buffer con cap + `optWithTempWindow` (cierra incl. en throw)
- Helpers: smoothstep, median, robustRatio/LinFit, seed bands
- **`window_leak`** (guarda F3): nº de ventanas al final == al inicio → caza huérfanas en todo flujo cubierto

**56 checks** en total (baseline `regression_baseline.json`). `node --check` NO aplica a `_tests/*.js`
ni a los entries (`#engine`/`#include`); el run real de PixInsight valida el parseo. node-check
SÍ aplica a los módulos `engine/*.js` y `ui/*.js` sueltos.

**Uso:**
```
# primera vez: captura baseline
PixInsight -n=152 --automation-mode -r="…/_tests/regression_suite.js" --force-exit
# siguientes: compara y reporta PASS/FAIL (RESULT: GREEN / RED) en regression_suite.log
```
La baseline vive en `_tests/regression_baseline.json`. **Tras cada paso de refactor:
re-ejecutar → debe seguir GREEN** (la modularización, Fase 1, debe ser byte-idéntica).
Para recapturar baseline (solo si cambia comportamiento a propósito): borrar el JSON.

Validado en Fase 0: GREEN con código idéntico; RED ante una perturbación de 1 nm
(control negativo); GREEN tras revertir.

## Plan por fases
- **F0** ✅ sandbox + harness (hecho)
- **F1** namespace + división en módulos (sin cambio de comportamiento)
- **F2** ImageOps + rendimiento
- **F3** diagnóstico de errores + ciclo de vida de ventanas — ✅ en progreso (enfoque aditivo/incremental, no big-bang): `window_leak` (guarda harness) + `engine/diag.js` (buffer de errores + `optWithTempWindow`) + adopción que PRESERVA comportamiento en `optSafeUi`+CabraMagic `stage()` + tarjeta "DIAGNOSTICS" en Configuration. GUI-validado (Measure Quality sin imagen → consola `[diag] UI: Measure Quality: ...` + MessageBox). Headless: 2 checks. + **guardas de ventanas (try/finally)** en 6 funciones de composición de CabraMagic (cierre garantizado de temps en error). 2 funciones complejas (temp→resultado) intencionalmente sin tocar; helpers de fondo ya seguros. Pendiente opcional: rutar más catches mudos selectivos.
- **F4** persistencia de sesión — ✅ v1+v2 (Workflow Presets): `engine/session.js` + botones Save/Load Preset en Configuration. v1 = registro de algoritmos; v2 = parámetros por-herramienta (Color Mixer + Detail) vía registro declarativo. GUI-validado end-to-end (set Strength 0.42 → save → JSON tiene `params.colorMixer.globalStrength=0.42` → cambio a 0.90 → load → "37 algorithm settings + 2 tool params applied" → widget vuelve a 0.42). Headless: 4 checks. Extensible: añadir una herramienta = un descriptor en `OPT_SESSION_PARAM_TOOLS`.
- **F5** motor de recetas — ✅ v1 (Intensidad): CabraMagic es metric-driven (receta = objeto de params de finishing, no lista de pasos). `engine/recipes.js` = override primitive + librería de **intensidad** Auto/Gentle/Balanced/Punchy (modula la fuerza del finishing; el análisis sigue decidiendo el tipo). Hook 1 línea en `optCabraMagicRun`; **selector "Intensity" en el Pre tab** junto al botón CabraMagic (`dlg.cabraIntensity` → `opts.recipeIntensity`). GUI-validado (combo renderiza, 4 opciones, seleccionable). Headless: 3 checks. v2 futura: capturar/reutilizar la receta de una imagen.
- **F6** UX de dos velocidades — ✅ v1 (toggle Simple/Advanced, usuario lo eligió): `engine/ui_mode.js` (flag + pref) + `applyUiMode`/`captureAdvancedPreSections` en el diálogo + checkbox "Simple" en la barra. **Simple** oculta las pestañas avanzadas (deja Pre) + las secciones avanzadas del Pre tab (Plate Solving/Gradient/Color/Decon/Continuum, por referencia), dejando imagen + Crop + CabraMagic + Intensity. Persiste en Settings; default Advanced. GUI-validado (toggle bidireccional + "Settings file updated"). **v2 (defaults por análisis) hecho 2026-06-29** — `engine/defaults.js` + botón "Suggest Defaults from Image" en Pre (siembra Star Reduction/Detail/Color Mixer desde `optAnalysisDefaults`); headless GREEN, falta GUI-validar.
- **F7** conveniencias — ✅ COMPLETO 4/4 (usuario eligió las 4: métricas, hub máscaras, denoise nativo, export mejorado):
  - ✅ **Métricas de calidad**: `engine/metrics.js` + tarjeta "Image Quality" / botón "Measure Quality" en Configuration (mide la ventana activa). GUI-validado (R/G/B medianas coinciden con la imagen de prueba). Headless: 1 check.
  - ✅ **Export mejorado**: `engine/export.js` + botón "Export As…" en la barra (TIFF/PNG/JPEG/FITS/XISF por extensión). Write/readback real validado headless (TIFF 64×48); GUI: botón renderiza + error limpio sin imagen. Headless: 2 checks.
  - ✅ **Denoise nativo** (= fallback TGVDenoise, núcleo nativo de PI): el autopiloto ya NO salta el denoise sin NXT/Prism → cae a TGVDenoise (siempre disponible). Lógica de selección pura `optCabraDenoiseChoice` + rama TGV en `optCabraMagicRun` (reusa `optExecuteTgvDenoiseConfiguredOnView`). Sin UI nueva. Validado: 1 check (selección) + smoke (TGV corre headless, ruido 4.86e-2→4.56e-2). Reutiliza el TGV ya implementado (no se reinventa algoritmo).
  - ✅ **Hub de máscaras** (Maker + Librería): `engine/masks.js` (`optMakeMask` dispatch range/color sobre los builders tiled existentes) + tarjeta "MASK MAKER" en Configuration (tipo Luminancia/Color, params, Create Mask, Librería de sesión + Show). GUI-validado end-to-end: Create Mask → generó Post_RangeMask (mono) de la imagen activa, librería actualizada, Show OK. Headless: 1 check (`mask_make`, window_leak 0). FAME/estrellas diferido a v2 (necesita el diálogo). **F7 COMPLETO (4/4).**

Orden de ataque: F0 → F1 → F3 → F2 → F4 → F6 → F5 → F7.

## Estructura de módulos (F1 en progreso)
El engine se va partiendo en `engine/*.js` vía `#include` (orden preservado, byte-idéntico,
funciones globales por ahora; el wrap en namespace `PIW` queda como sub-paso opcional posterior).
Cada extracción se valida con el harness (GREEN).

**ENGINE MODULARIZADO: 13.913 → 633 líneas de entry (95%). 19 módulos (18 del refactor +
`defaults.js` de F6 v2), todos GREEN, 508 funciones preservadas exactas (= Dev_194):**
- `engine/config_registry.js` (113) — registro enable/disable de algoritmos + prefs
- `engine/session.js` (~145, F4) — presets de workflow: serializa el registro de algoritmos + (v2) parámetros por-herramienta vía registro declarativo `OPT_SESSION_PARAM_TOOLS` (Color Mixer, Detail) a/desde JSON con nombre; capture(dlg)/apply(state,dlg)/toJson/fromJson/save/load
- `engine/ui_mode.js` (~30, F6) — modo Simple/Advanced: flag + persistencia `PIWorkflow/uiMode` (read/write). El show/hide lo hace `PIWorkflowOptDialog.applyUiMode`
- `engine/diag.js` (~70, F3-full) — capa de diagnóstico: buffer de errores con cap (`optDiagError`/`optDiagText`/`optDiagClear`) + `optWithTempWindow` (cierre garantizado, incl. en throw). Adoptado en `optSafeUi` (todos los handlers) + `stage()` de CabraMagic (todas las etapas), preservando comportamiento
- `engine/utils.js` (1083) — UI/process helpers, hue/color, histogram cache, dependency checks
- `engine/loaders.js` (844) — descubrimiento de herramientas + carga de scripts opcionales + paths
- `engine/view_utils.js` (404) — helpers de view/image/key + clone/close + madMidtone
- `engine/preview.js` (200) — render de preview/bitmaps
- `engine/channels.js` (670) — RGB/LRGB/narrowband + DBXtract + getters SPFC/SPCC/MGC
- `engine/pre.js` (943) — dispatch pre-candidate + batch + astrometría + MGC/ABE + Optimal Transport
- `engine/enhance.js` (649) — Image Enhancement: Color Mixer + Detail + Depth/Contrast
- `engine/cabramagic.js` (1296) — autopiloto: analyzer/classifier/tree/compose/exec
- `engine/recipes.js` (~115, F5) — recetas de finishing: `optRecipeNormalize` + librería de intensidad `OPT_RECIPE_INTENSITY` (Auto/Gentle/Balanced/Punchy) + `optRecipeApplyIntensity` (modula la receta del análisis por gain) + `optCabraResolveRecipe` (precedencia: opts.recipe > opts.recipeIntensity > auto)
- `engine/defaults.js` (~75, F6 v2) — `optAnalysisDefaults(stats)` puro: proyecta el análisis sobre los controles MANUALES (starRedStrength 1:1, detail "By Object Type" objType+intensity, colorMixerStrength desde SNR). Lo consume `PIWorkflowOptDialog.applyAnalysisDefaults` (botón "Suggest Defaults from Image" en Pre). Flag `OPT_ANALYSIS_DEFAULTS_ENABLED`
- `engine/metrics.js` (~80, F7) — métricas de calidad de imagen puras: `optQualityMetrics(view)` (fondo p5, ruido MAD, SNR, % saturación, rango dinámico, medianas R/G/B; método de CabraMagic) + `optQualityMetricsText` (formato)
- `engine/export.js` (~55, F7) — export multi-formato: `optExportFormatForPath` (ext→formato/bits, puro) + `optExportViewToFile` (TIFF/PNG/JPEG/FITS/XISF vía FileFormatInstance)
- `engine/masks.js` (~35, F7) — `optMakeMask(view, spec)` dispatch sobre los builders tiled (range/luminancia + color/hue) → ventana de máscara reutilizable
- `engine/gradient.js` (836) — gradiente: AutoDBE/GraXpert + dispatch + configs deconv
- `engine/external_tools.js` (965) — BlurX, Cosmic Clarity, SyQon Prism/Parallax/Starless
- `engine/color_calibration.js` (184) — SPCC / Auto Linear Fit / Background Neutralization
- `engine/sssc.js` (584) — calibración SSSC (Gaia, sin curvas)
- `engine/continuum.js` (385) — Continuum Subtraction
- `engine/autoghs.js` (~250) — motor AutoGHS. **AUTOGHS-SATURATION (2026-06-29):** en modo color mezcla cada canal hacia la luminancia estirada `Ls=ghs(L)`: `out = Ls + sat·(canal·ghs(L)/L − Ls)`. `sat=1`=legacy (color pleno, byte-idéntico); `sat<1` baja saturación Y reduce blowout de núcleos (tira los canales hacia Ls≤1). Constante `OPT_AUTOGHS_SATURATION=0.92` (default suave; override `params.aghs_saturation`; 1=revertir). NOTA: el intento previo (cap de color "preserve") se descartó — preservar la proporción lineal SUBÍA la saturación en nebulosas (el clamp legacy desaturaba). **AUTOGHS-NOISE-CEILING (2026-06-29):** el stop por mediana fija (0.22) fuerza un estiramiento ilimitado en datos tenues/baja-SNR (p.ej. OIII débil) → amplifica el ruido del cielo. Con `params.aghs_noiseCeiling>0` el loop también para cuando el ruido de fondo (sigma de la población oscura, `optAutoGhsBgNoise`) alcanza el techo. Auto-discrimina: datos limpios llegan a la mediana antes (igual); datos ruidosos paran antes. `OPT_AUTOGHS_NOISE_CEILING=0` (default OFF, no toca Stretching manual ni harness); el autopiloto (`optCabraMagicRun`) pasa 0.05
- `engine/stretch.js` (1420) — OptStretchingEngine + apply candidate
- `engine/post.js` (1789) — denoise/color balance/curves/FAME masks/post-candidate
- `engine/channel_combination.js` (723) — blend/slots/compose CC

El entry (632 líneas) = header + pjsr-includes + constantes/OPT_ globals + i18n + low-level
(processEvents/msleep/shim) + los 18 `#include` + glue/main (policy/self-check/optMain).

**UI MODULARIZADA: 11.971 → 93 líneas de entry. 10 módulos, todos node-check OK + harness
GREEN, 237 símbolos preservados exactos (= Dev_194), 0 líneas perdidas:**
- `ui/theme.js` (464) — colores/fuentes/estilos + tooltips/i18n + diálogos Thanks/Repos
- `ui/store.js` (808) — scheduler, image store/record, memory managers + helpers
- `ui/widgets.js` (1764) — mipmaps, init preview control, builders (optButton/optNumeric/optSection) + todos los optThemeApply/Build*
- `ui/panels.js` (1258) — OptImageCombo, OptSelectionPanel, OptPreviewPane
- `ui/tabs_core.js` (1442) — OptWorkflowTab + compare functions + apply-all + availability
- `ui/dialog_chrome.js` (1425) — config-tab page, dialog init, stretch zone, title bar/pills, channel helpers
- `ui/sections_pre_stretch.js` (1268) — optBuildPreCropSection + configurePreTab/StretchTab + curves widget
- `ui/sections_post.js` (1542) — mask panel + post section builders + configurePostTab
- `ui/sections_enh_cc.js` (975) — configureImgEnhTab + Color Mixer/Detail sections + configureCcTab
- `ui/dialog.js` (942) — buildConfigPage + policies/refresh/star-split/sendActive/runCabraMagic/finalCleanup

El entry UI (93 líneas) = constante `Theme` + los 10 `#include`.

**F1 COMPLETO** (engine + UI). Total: **28 módulos + 2 entries finos** (engine 632 + UI 93),
745 símbolos preservados exactos, harness GREEN. Validación UI: `node --check` cada módulo +
harness que parsea la UI + byte-idéntico. **OJO al cortar:** empezar siempre en
`(línea_del_#include_anterior + 1)` — si capturas un `#include` en el módulo, su path se
rompe (caza node-check). Recomendado: validar el diálogo completo en GUI antes de publicar.
Opcional/diferido: wrap namespace `PIW` (alto riesgo / bajo beneficio dado el prefijo `opt`/`OPT_`).

**UPDATE 2026-07-08 — Batería de tests (CONSTRUIDA, fases 1-5 + niveles 0 y 2):** implementado el plan
ejecutable de `_tests/PLAN_BATERIA_TESTS.md` SIN tocar nada fuera de `_tests/` (build sigue 27). Ficheros
nuevos: `synth_factory.jsh` (fábrica sintética determinista con ground truth: rgbLinear, monoChannel,
lineContinuumPair con k conocido, starField con PSF, gradientImg, noisyImg mulberry32, saturada/casi
negra/tiny, hueStrips), `battery_suite.js` (nivel 1: packs P0-P12, cronómetro+SLOW_MS=20s, guard de fugas
de ventanas por test y global, log incremental `battery_suite.log`, genera `battery_report.md` integrando
los JSON de niveles 0 y 2), `battery_level0.js` (nivel 0 node: anti-drift OPT_ALGO_MENUS vs
combos/cards/zonas de la UI, convención 5-sitios de DeepSNR, i18n global 0 faltantes, coherencia
OPT_*_ENABLED, node --check de los 39 módulos), `battery_tools_smoke.js` (nivel 2: SXT/StarNet2/BXT/NXT/
GraXpert/DeepSNR/SyQon con SKIP limpio si faltan) y `GUI_CHECKLIST.md` (nivel 3 manual).
**Cómo se corre:** `node "_tests/battery_level0.js"` (segundos) · PixInsight headless
`-n=152 --automation-mode -r=".../_tests/battery_suite.js" --force-exit` (nivel 1, ~8 s) · ídem con
`battery_tools_smoke.js` (nivel 2, ~19 s). Leer SIEMPRE el log/reporte, no el stdout.
**Resultado del run inicial (build 27):** nivel 1 GREEN 57 pass/0 fail/0 slow/2 skip esperados (star-mask v2 diferida
+ P12 sin imágenes aún); nivel 2 GREEN 4 pass/4 skip; nivel 0 29 pass/**2 FAIL legítimos** →
reporte global RED por el hallazgo Nº2. **Hallazgos:** (Nº1) DeepSNR se añadió al registro sin recapturar
el baseline del regression — recaptura AUTORIZADA 2026-07-08, 37→38 algos, backup en
`_tests/regression_baseline_pre_deepsnr.json.bak`, diff verificado (solo conteos de sesión; regression
vuelve a GREEN 59/59); (Nº2) DeepSNR NO estaba en el help EN/ES (sitio 5 de la convención); (Nº3) los
wrappers RC-Astro (optCabraStarless/optExecuteBlurXConfiguredOnView/optExecuteNoiseXConfiguredOnView)
ignoraban `executeOn === false` → paso silenciosamente no aplicado. Gotcha PJSR nuevo:
File.writeTextFile corrompe emojis de 4 bytes (surrogates) → el reporte se escribe con codificador UTF-8
manual (`utf8ByteArrayFromString`). REGLA VIVA del plan: toda funcionalidad nueva añade su test a la
batería en el mismo cambio (la convención de 5 sitios pasa a 6: +batería).

**UPDATE 2026-07-08 (build 28) — hallazgos Nº2/Nº3 RESUELTOS + P12 con imágenes reales.** Ver la fila
build 28 de la tabla de arriba para el detalle. Estado tras el arreglo: **reporte global GREEN** — nivel 0
31/0 (DeepSNR sitio 5 EN/ES ya PASS), nivel 1 63 pass/0 fail (P12 corre 6 recortes reales del repositorio
CabraSpace, todos PASS <3.3 s), nivel 2 4 pass/4 skip, regression 59/59 GREEN. El único punto abierto de la
batería es **P12 pendiente solo de que el usuario deje recortes en `_tests/images/`** si quiere fijar un set
local (hoy usa el repositorio real por defecto). Los SKIP de nivel 2 (SXT/BXT/NXT executeOn=false en headless)
son esperados y ahora, con el hallazgo Nº3 arreglado, se convertirían en FAIL visibles si ocurrieran en GUI
(antes pasaban desapercibidos) — el `GUI_CHECKLIST.md` incluye validarlos a mano.
