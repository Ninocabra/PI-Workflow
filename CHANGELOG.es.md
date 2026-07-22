# Changelog

Todos los cambios relevantes de PI Workflow se documentan aquí.

> Este archivo es la versión en español de `CHANGELOG.md`. El bloque de la última
> versión lo **genera automáticamente** el workflow `translate-changelog` (GitHub
> Models) cada vez que se actualiza `CHANGELOG.md`. La web de CabraSpace lo lee en vivo.
> No lo edites a mano para la última versión: edita `CHANGELOG.md` (inglés) y el español
> se regenera solo. (Puedes retocar a mano bloques de versiones anteriores.)

## [2.0] - 2026-07-20

PI Workflow 2.0 — la reescritura modular. Versión mayor (build 32): el número de
versión pública se reinicia desde la serie v8.x a 2.0 para marcar la reescritura
modular. La cabecera ahora indica `2.0 · 2026-07-20 · build 32`.

### Novedades frente a v8.9
- **Arquitectura modular nueva** (motor `engine/` + interfaz `ui/`): base más estable y mantenible.
- **Pestaña Mejora de Imagen.**
- **Pestaña Configuración** (defaults y algoritmos configurables por el usuario).
- **Continuum Subtraction** — resta de continuo para banda estrecha (con aviso en la interfaz sobre el anillo oscuro alrededor de estrellas compactas).
- **"Apply all" por lotes en Pre-procesado** — Gradiente/Deconvolución a todos los slots, propagar plate-solve y Star Split a todas las imágenes, cada uno con try/catch por slot para que un fallo no aborte el lote.
- **Máscara de capas en exportación** y **registro de procesado (log)** al exportar.
- **Interfaz bilingüe ES/EN** con cambio de idioma en caliente.
- **Motores SyQon V3** — Starless reescrito al nuevo contrato "Axiom V3": corre totalmente oculto (TIFF float32, sin `--gui`, reintento automático en CPU si falla la GPU). Parallax v1.5 con selector de estilo Natural/Defined. Prism verificado sin cambios.

### Bugs resueltos frente a v8.9
- **Herramientas IA que fallaban en silencio** — BlurXTerminator/StarXTerminator/NoiseXTerminator/DeepSNR/StarNet2 daban por bueno un paso aunque el motor IA fallara; ahora lanzan error (vía `optAssertExecuteOk`) en vez de dejar la imagen intacta y darla por procesada.
- **SyQon Starless roto con el nuevo ejecutable** (los flags del antiguo CLI de Python ya no existían; la app abría una ventana visible): reintegrado para correr oculto.
- **Fugas de ventanas** en la cadena de fallback del starless (StarNet2 / SyQon) cerradas.
- **Secciones de "Mejora de Imagen"** salían expandidas al entrar → corregido.
- **SSSC** no aparecía en Configuración → Color Correction → añadido.
- **DeepSNR** faltaba en la ayuda → documentado (ES+EN).

## [V8_9] - 2026-06-16

Solo paquete 1.9.4+ (el paquete congelado 1.9.3 no cambia).

### Novedades
- **Parallax (SyQon)** disponible como algoritmo de **Pre → Deconvolución** (orden del combo BlurXTerminator → Parallax → Cosmic Clarity) y de **Post → Enfoque** (insertado justo tras BlurXTerminator). Es un motor neuronal externo de SyQon que combina corrección de aberraciones, reducción de estrellas y enfoque en una sola pasada. La ruta del ejecutable se autodetecta de la configuración de SyQon Parallax (multiplataforma, macOS incluido). En Post, "Use PI Temp Stretch" está desactivado por defecto (los datos ya son no lineales); en Pre está activado para datos lineales.
- **Star Split "Apply all"** — genera `<base>_Starless` / `<base>_Stars` para todas las imágenes disponibles en la pestaña Estirado en una sola acción, con try/catch por slot.

### Cambios
- **AutoGHS** ahora levanta el fondo del negro puro hasta un suelo configurable (por defecto 0.1) con una única pasada afín tras las iteraciones (`0 → suelo, 1 → 1`; poner a 0 para desactivar), evitando sombras aplastadas.

## [V8_8] - 2026-06-08

Corrección aplicada a **ambos** paquetes (1.9.4 y la build 1.9.3, reeditada una vez).

### Bugs resueltos
- **Color Calibration / Auto Linear Fit / Background Neutralization / Optimal Transport** ya no emiten `*** Error: AstrometricMetadata::Write(): Incompatible image dimensions` tras un recorte + plate solve. Estos algoritmos separan la imagen en canales RGB y los recombinan; ahora se ejecutan sobre una copia sin metadatos astrométricos y los píxeles procesados se copian de vuelta, para no escribir nunca una solución obsoleta. SPCC no se ve afectado (no separa canales y conserva la solución).

---

Para el historial completo y las versiones anteriores (V8_7 y previas, incluidos los
detalles internos del rediseño visual), consulta [`CHANGELOG.md`](CHANGELOG.md).
