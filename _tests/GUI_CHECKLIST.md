# GUI CHECKLIST — Batería PI Workflow · Nivel 3 (manual)
**2026-07-08 · build 27.** El diálogo PJSR es modal → no automatizable: este nivel se pasa A MANO
tras cada release candidate. Marca ✅/❌ y anota build+fecha. Complementa los niveles 0-2
(automáticos: `node _tests/battery_level0.js` · `battery_suite.js` · `battery_tools_smoke.js`).

## Arranque / barra global
- [ ] El script abre sin errores en consola; cabecera muestra **versión · fecha · build** correctos.
- [ ] Toggle **ES/EN** re-traduce pestañas, secciones y botones en vivo (ida y vuelta).
- [ ] Botón dorado **Simple/Advanced** alterna el modo y las secciones visibles.
- [ ] **Export As…** exporta (elige .xisf) y el MessageBox lista imagen + sidecars `.txt`/`_astrobin.csv`.
- [ ] **Load Image Files…** (Image Selection) carga múltiples ficheros y puebla los combos.
- [ ] **Autoasignación de slots** (build 32): en la pestaña NB, cargar `C1_HO.xisf` + `C2_OS.xisf` → los slots HO/OS quedan asignados solos (consola: "auto-assigned HO <- …"); un slot ya elegido a mano NO se pisa; en modo R+G+B los sufijos _R/_G/_B/_L (o el keyword FILTER) asignan sus slots.
- [ ] **Autoasignación con imágenes YA ABIERTAS** (build 34, informe del usuario): abrir `MasterLight_H/O/S` con File > Open ANTES de lanzar el script → al arrancar (o al pulsar el modo NB) los slots H/O/S se rellenan solos desde las ventanas abiertas (consola: "=> Image Selection: auto-assigned H <- MasterLight_H (name)").

## Pestaña Pre
- [ ] Gradient Correction: combo solo muestra motores instalados+habilitados; **Compare** pinta progreso "Comparar i/N…" y el ✕ cancela.
- [ ] Color Correction (action cards): SPCC/SSSC/ALF/OT/BN visibles según Configuración; SSSC corre (o avisa si falta Gaia).
- [ ] **RC-Astro en GUI** (hallazgo Nº3 de la batería): BXT/NXT/SXT ejecutan DE VERDAD en GUI (en automation-mode su executeOn devuelve false y el motor lo silencia — verificar que en GUI la imagen SÍ cambia).
- [ ] CabraMagic (Simple): corre entero, consola termina con "CabraMagic QA: …", sin ventanas huérfanas.
- [ ] Continuum Subtraction: con objeto compacto muestra el aviso ámbar "compact target… halos expected".

## Pestaña Stretching
- [ ] Zona RGB/Starless: los 5 algoritmos (AutoGHS por defecto) estiran el preview; slider Saturation responde.
- [ ] **SyQon Starless V3** (build 35): Star Split → SyQon Starless corre **sin que se abra ninguna ventana de SyQon** (headless), el preview recibe starless+stars y el overlay pinta el % de progreso; el grupo de ajustes muestra solo Overlap · Device · Stars Mode. (Validado en GUI en la RC 2026-07-16.)
- [ ] **Parallax "Model Style"** (build 35): combo Natural/Defined visible en Pre → Decon → Parallax y Post → Sharpening → Parallax; con Defined la consola muestra `--mode aesthetics`. (Validado en GUI en la RC 2026-07-16.)
- [ ] Zona Stars: AutoGHS default; NB→RGB stars si hay info NB.
- [ ] Star Split: combo según motores; split genera starless+stars sin fugas.
- [ ] Crop: rectángulo, handles y realineado WCS funcionan.

## Pestaña Post
- [ ] NR: combo (NXT/TGV/CC/GraXpert/Prism/**DeepSNR**) según instalado+habilitado; DeepSNR corre con imagen ≥512px.
- [ ] Sharpening: USM/HDR/LHE/DSE corren; máscara post (rango/color/FAME) se genera y aplica.
- [ ] Curves: editor responde y aplica.

## Pestaña Channel Combination
- [ ] Apilar 3+ capas con opacidad <1 y modos Screen/Multiply/Overlay → preview == "To Image Enhancement" (WYSIWYG).
- [ ] Máscara de capa estilo Photoshop: mitad blanca/negra en capa Screen → mitad mezcla, mitad base.
- [ ] Fast drag: al togglear, el arrastre usa resolución de preview y el commit va a full-res.

## Pestaña Mejora de Imagen
- [ ] Color Mixer: bandas, strength y selectividad con live preview; "Show mask" por banda.
- [ ] Detail & Contrast: los 9 algoritmos aplican con preview; secciones nacen COLAPSADAS al entrar.

## Pestaña Anotaciones
- [ ] Analizar: markers sobre los objetos, leyenda, slider profundidad, subtipos ▾.
- [ ] SIMBAD/VizieR online añaden objetos (si hay red); estrellas Gaia como anillos; color real BP-RP.
- [ ] Aladin embebido alterna con el lienzo; "Guardar imagen anotada" exporta PNG con overlay.

## Pestaña Configuración
- [ ] Desactivar un algoritmo lo oculta de su combo/card al instante; reactivarlo lo devuelve EN SU ORDEN.
- [ ] Desactivar TODOS los de un menú → mensaje de "no engines enabled" sin crash.
- [ ] Los toggles persisten tras cerrar y reabrir el script.

## Export / logs (flujos completos)
- [ ] Export a workspace: la vista exportada lleva la propiedad `PIWorkflow:ProcessingLog`.
- [ ] Export TIF: keywords `PIW|` en el fichero + `.txt`/`_astrobin.csv` al lado.

_Resultado del pase: __ / __ · fecha: ________ · build: ____ · notas:_
