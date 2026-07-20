# HANDOFF — Pestaña "Anotaciones" (feature #13)
**Última sesión: 2026-07-05 · Versión 1.0 · Build 24 · Tests 73/73 GREEN**

> Documento para **retomar en un chat nuevo**. Es autocontenido: léelo entero antes de
> seguir. El log por build está en `README_DEV_200.md` (tabla de builds). El estado
> vivo del proyecto está en la memoria (`MEMORY.md` → `project-dev200.md`).

---

## 0) Contexto en una frase
Estamos desarrollando la pestaña **"Anotaciones"** del script PixInsight **PI Workflow**
(sandbox `Dev_200`), una función tipo *"What's In My Image"* de SetiAstro pero simplificada:
detecta objetos DSO en la imagen resuelta (WCS), los agrupa por categoría con marcadores
(elipses/círculos) + etiquetas, tiene estrellas Gaia, un mapa del cielo Aladin embebido, y
consulta catálogos **locales + online**. Está **flag-gated** (`OPT_ANNOTATIONS_ENABLED`) para
poder sacar una release sin ella.

## 1) Cómo verificar cambios (SIEMPRE antes de cerrar)
```bash
cd "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200"
# a) node --check de un fichero con directivas PJSR (# y #__FILE__):
sed -e 's/^#.*$//' -e 's/#__FILE__/""/g' "engine/annotations.js" > /tmp/chk.js && node --check /tmp/chk.js
# b) suite de tests del motor (funciones puras) — DEBE decir GREEN:
node _tests/ann_engine_test.js        # -> RESULT: GREEN (73 pass, 0 fail)
# c) GUI: el usuario ejecuta el script en PixInsight y observa (el foco de PI está
#    bloqueado para automatizar; validamos por capturas que envía el usuario).
```
**OJO Windows:** NO uses `sed -i` para editar ficheros del proyecto → deja basura
`*.tmp.*`. Usa la tool `Edit`, o `python` para editar in-place.

## 2) Política de versión/build (acordada)
- `OPT_VERSION` (`1.0`) la cambia **solo el usuario** cuando lo pide.
- `OPT_BUILD` lo **incremento yo en CADA modificación** del script (monotónico). Ahora = **24**.
- `OPT_BUILD_DATE` = fecha del build. Todo en `PI Workflow.js` (~línea 293) y en la cabecera del
  diálogo (versión·fecha·build). Cada build se anota en la tabla de `README_DEV_200.md`.

## 3) Arquitectura de la feature #13 (ficheros y funciones clave)
- **`engine/annotations.js`** — motor puro + PJSR. Funciones importantes:
  - Modelo: `OPT_ANN_CATEGORIES` (claves ES), `OPT_ANN_CATCOLOR`, `OPT_ANN_SUBTYPES`,
    `OPT_ANN_TYPELABEL` (ES), `optAnnClassify(type)` (OpenNGC Type→categoría).
  - i18n display: `OPT_ANN_CAT_EN`, `OPT_ANN_TYPELABEL_EN`, `optAnnCatLabelEN`, `optAnnTypeLabelEN`.
  - Subtipos: `optAnnSubtypeActive(o, subActive)`.
  - Catálogo: `optAnnParseCatalog(text)` (CSV `;`), `optAnnCatalogDir()` (usa `#__FILE__`),
    `optAnnLoadCatalog()` (concatena `NGC.csv` + `addendum.csv` + `extra.csv`, cachea).
  - Geometría: `optAnnPlaceObject(win, center, margin, r, W, H)` (celestialToImage + elipse via
    ejes N/E locales; devuelve ix/iy/aPx/bPx/mux/muy). `OPT_ANN_SIZE_FACTOR=1.4`.
  - Query principal: `optAnnQueryImage(win, opts)` → `{ok, center, fovDeg, objects, online, onlineError}`.
    `opts.online` + `opts.source` activan la vía online.
  - Online (Fase B): `optAnnDownloadText(url)` (**NetworkTransfer** síncrono, patrón oficial),
    `optAnnOnlineSource(source)` (dispatcher build+parse), SIMBAD (`optAnnBuildSimbadUrl`,
    `optAnnParseSimbadTsv`, `optAnnSimbadOtypeToCat`, `OPT_ANN_SIMBAD_OTYPES`), VizieR
    (`optAnnBuildVizierUrl`, `optAnnParseVizierTsv`), `optAnnDedupByPosition`.
  - Estrellas: `optAnnQueryStars`, `optAnnStarColor` (BP-RP).
- **`ui/sections_annotations.js`** — `PIWorkflowOptDialog.prototype.configureAnnotTab`. Construye la
  pestaña sobre `OptWorkflowTab` (hereda Selección de Imágenes + memory slots + barra de imágenes +
  preview). `paintOverlay(g,disp,offX,offY)`; `pv.onOverlayPaint`; `doAnalyze(source)` (analyze local
  o local+online); `loadStars`; `exportAnnotated`; `toggleSky` (WebView Aladin apilado). Secciones:
  "Catalog objects" (profundidad + categorías con ▾ + estrellas + **botones de survey** SIMBAD/VizieR
  + combo + Analizar CTA) y "Sky map & export". Termina con `leftContent.sizer.addStretch()`.
- **`ui/dialog_chrome.js`** — crea `self.annotTab = new OptWorkflowTab(...)`, llama `configureAnnotTab()`,
  añade la página antes de "Configuration".
- **`ui/dialog.js`** — `activeWorkflowTab()`, `onTabChanged` (al entrar marca disponibles +
  `refreshSelections` + `refreshWorkflowButtons`), **`refreshWorkflowButtons()` incluye
  `annotTab.preview.refreshButtons()`** (build 17, EL fix de los chips), `refreshSelections()` incluye annotTab,
  y `sendActiveTo*`/`publishFinal` marcan `OPT_TAB_ANNOT` disponible.
- **`ui/tabs_core.js`** — `setRecord` marca `OPT_TAB_ANNOT` para cualquier imagen committed.
- **`ui/panels.js`** — `OptPreviewPane.refreshButtons()` (chips de imágenes; visible = `isAvailable(key, this.tab)`).
- **`catalogs/`** — `NGC.csv` (OpenNGC ~12.9k), `addendum.csv`, **`extra.csv`** (399: 86 Abell PNe + 313
  Sharpless, de SIMBAD, formato OpenNGC `;`).
- **`PI Workflow_resources.jsh`** — `OPT_I18N_ES` (bloque "Annotations tab" con ~60 entradas).
- **`_tests/ann_engine_test.js`** — 73 tests de las funciones puras (incluye uno que carga el
  `OPT_I18N_ES` real y verifica 0 traducciones faltantes).
- **`PI Workflow.js`** — flags `OPT_ANNOTATIONS_ENABLED=true`, `OPT_TAB_ANNOT="annot"`;
  `#include "engine/annotations.js"`; OPT_VERSION/OPT_BUILD/OPT_BUILD_DATE.

## 4) Lo hecho hoy (builds 17→24)
- **17** — Bug de los chips: faltaba `annotTab.preview.refreshButtons()` en `refreshWorkflowButtons`.
  (La imagen RGB ya aparece en Anotaciones. **Validado por el usuario: "Ahora funciona bien".**)
- **18** — Etiquetas ancladas a la **punta del eje mayor** (antes quedaban lejos en galaxias diagonales).
- **19** — **Sub-desplegables ▾ por categoría** (elegir subtipos, estilo SetiAstro agrupado).
- **20** — **Fase A**: `extra.csv` (Abell PNe + Sharpless) → **Abell 39 se detecta**. (El problema NO
  eran los surveys: Abell 39 no estaba en OpenNGC. Los "surveys" de Aladin son solo imagen de fondo.)
- **21** — **Fase B**: consulta **online SIMBAD** (NetworkTransfer). **Validado: NetworkTransfer FUNCIONA en PI.**
- **22** — El checkbox de online → **botón** ("Buscar en surveys online:" con botón SIMBAD).
- **23** — 2ª fuente **VizieR (HyperLEDA)** + infra multi-fuente. **NED descartado** (floodea, sin tamaños).
- **24** — **i18n completo** de la pestaña (fuente EN + `optT`; ~60 entradas ES; test de cobertura).

## 5) PENDIENTES (prioridad sugerida para mañana)
1. **Validar VizieR EN VIVO** — hoy los servidores de VizieR estaban **caídos** (503 / "database not
   reachable", **fallo de su lado**). El botón VizieR está implementado y testeado con muestra sintética
   (reproduce NGC1560 9.55′×1.70′ PA21), pero NO probado contra el servidor real. **Cuando VizieR vuelva:**
   Analizar en un campo de galaxias → botón VizieR → debe salir "· +N de VizieR". Si el `http://` no le
   gusta a NetworkTransfer, cambiar a `https://` (1 línea en `optAnnBuildVizierUrl`).
2. **Validar en GUI el toggle ES/EN** en la pestaña (build 24) — que TODO cambie de idioma.
3. **Backfill de diámetros Sharpless** — solo 84/313 traen tamaño de SIMBAD (resto salen como círculo).
   Fuente: VizieR **VII/20** (`Diam` en arcmin), cruzar por número Sh2, mantener coords J2000 de SIMBAD.
4. **Selector de surveys de IMAGEN para Aladin** (DSS2 color/red, 2MASS, PanSTARRS) — combo que cambie el
   `survey:` del HTML de Aladin. Nota: el mapa Aladin ya trae control de capas interno (`showLayersControl`).
5. **Fundir la imagen real en el mapa Aladin** (hoy solo dibuja el footprint/recuadro). Requiere capa
   imagen con WCS o mini-HiPS — es lo más complejo.
6. **Marcar visualmente los objetos online** (`o.online=true`) para distinguirlos del catálogo local.

## 6) Gotchas PJSR v8 (imprescindibles, ya aprendidos)
- Scripts standalone → IIFE (scope global persiste → redeclaraciones). Diálogos: `class X extends Dialog {
  constructor(){ super(); } }` (NO el patrón `__base__`).
- `#define` numéricos NO se expanden bien dentro de template literals → inyectar por `.replace()`/placeholders.
- Constantes con guion bajo (`UndoFlag_*`, `StdIcon_*`) requieren `#include <pjsr/*.jsh>` en standalone.
- `#__FILE__` = ruta del fichero **incluido** (no del principal). `optAnnCatalogDir()` sube de `engine/` a `catalogs/`.
- Astrometría nativa: `window.imageToCelestial(x,y)` / `window.celestialToImage(new Point(ra,dec))` (exacto al píxel).
- **NetworkTransfer** (HTTP síncrono, patrón oficial en `C:/Program Files/PixInsight/src/scripts/Ephemerides/
  CoordinateSearchDialog.jsh`): `t.setURL(url); t.downloadData=new ByteArray; t.onDownloadDataAvailable=
  function(d){this.downloadData.add(d); return true;}; t.download(); t.downloadData.toString();`. **Usar
  `http://` plano** para evitar líos SSL. CONFIRMADO funcionando dentro de PI.
- Aladin: **v2** (canvas 2D) funciona en el WebView; **v3 NO** (necesita WebGL, que el WebView no tiene).
- i18n: fuente **inglés** + `optT("English")` → ES via `OPT_I18N_ES`; `optI18nLabel(control,"English")` registra
  para re-traducir al togglear idioma. Estados dinámicos: `optT()` directo (no se registran).

## 7) Datos de las APIs online (para no re-derivar)
- **SIMBAD TAP** (funciona): `http://simbad.cds.unistra.fr/simbad/sim-tap/sync?request=doQuery&lang=adql&
  format=tsv&query=<ADQL>`. Cone-search DSO con **filtro anti-flood obligatorio**:
  `SELECT TOP 500 main_id,ra,dec,galdim_majaxis,galdim_minaxis,galdim_angle,otype FROM basic
   WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS',<ra>,<dec>,<r>))=1 AND galdim_majaxis>=0.5
   AND otype IN (...whitelist...)`. Sin el filtro, un campo devuelve decenas/miles de galaxias SDSS mag 20+.
  Identificadores útiles: Abell PNe = `id LIKE 'PN A66 %'`; Sharpless = `id LIKE 'SH  2-%'` (DOS espacios;
  excluir subcomponentes con `AND id NOT LIKE 'SH  2-% %'`). **Ojo ADQL:** `min` es palabra reservada;
  NO usar `ORDER BY` con alias cualificado (rompe el parser de SIMBAD); el join a `allfluxes` daba error.
- **VizieR TAP** (HyperLEDA, hoy caído): `http://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync?...&format=tsv`.
  Catálogo `"VII/237/pgc"`, columnas `PGC,RAJ2000,DEJ2000,logD25,logR25,PA,ANames`. Conversión:
  **size(arcmin)=10^(logD25−1)**, **minor=size/10^logR25**, PA directo. Filtro: `logD25 >= 1+log10(0.5)`.
- **NED** (DESCARTADO): `https://ned.ipac.caltech.edu/cgi-bin/objsearch?...&of=ascii_bar`. Devuelve miles
  (2794 en 10′), sin columna de tamaño, tabla bar-separada con preámbulo. Filtrado por mag solo deja
  estrellas/duplicados → no aporta sobre SIMBAD. No re-intentar salvo que el usuario insista.
- Scripts desechables usados hoy (en el scratchpad de la sesión, NO en el repo): `build_extra.js`
  (SIMBAD→OpenNGC), y consultas curl. Si hace falta regenerar `extra.csv`, se re-crea con SIMBAD TAP.

## 8) Gating de release (importante)
La release "limpia" saldrá **sin Anotaciones (#13) y sin CabraMagic**, tras flags:
`OPT_ANNOTATIONS_ENABLED` y `OPT_CABRAMAGIC_ENABLED` (este en `engine/cabramagic.js:3`). Cortar release =
poner flags a false, NO borrar código. Cada cambio de flag es también un build nuevo.

---
### Primer paso sugerido mañana
1. `node _tests/ann_engine_test.js` → confirmar GREEN 73/73.
2. Pedir al usuario que valide en GUI: toggle ES/EN en Anotaciones (build 24) y, si VizieR ya responde,
   el botón VizieR. Según resultado, atacar pendiente #1/#2, luego #3 (backfill Sharpless).
