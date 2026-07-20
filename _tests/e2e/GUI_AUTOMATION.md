# GUI / Interacción / Tools IA — test por control del PC (computer-use)

**Qué cubre esto (y por qué no es headless):** en modo headless (`--automation-mode`, sin GPU/GLES) las tools
de IA RC-Astro (StarXTerminator, BlurXTerminator, NoiseXTerminator) devuelven `executeOn=false` y NO ejecutan,
y el diálogo del script es **modal** (no se puede pilotar por script). Todo eso solo se valida **en la GUI real**,
tomando el control del ratón/teclado (computer-use). Esto complementa al E2E headless (`e2e_suite.js`), que sí
prueba el flujo completo pero degradando la IA a motores CPU (ABE/AutoGHS/DeepSNR/TGV).

## Prerrequisitos (antes de lanzar la sesión de control)
1. PixInsight **abierto** en el escritorio.
2. El script cargado en el **Script Editor**: `Dev_200/PI Workflow.js` (o el de la RC), listo para *Compile & Run*.
3. Una imagen de trabajo abierta (recomendada, RGB lineal): `CabraSpace/Pagina Web/Imagenes Prueba/RGB_LDu_2.xisf`.
4. Conceder acceso de computer-use a PixInsight cuando se pida (`request_access`).
5. Que NO estés usando el PC a la vez (el control mueve tu ratón/teclado real).

## Casos a verificar (mapa con `../GUI_CHECKLIST.md`)
| # | Caso | Cómo se comprueba | PASS = |
|---|------|-------------------|--------|
| G1 | El script **carga** en GUI | Compile & Run → Process Console | `Dependency Check: … ERROR=0`, diálogo abre sin excepción |
| G2 | **StarXTerminator ejecuta** de verdad | Star Split → SXT sobre la imagen | la imagen pierde estrellas (no error `executeOn=false`); log del proceso OK |
| G3 | **BlurXTerminator ejecuta** | Sharpening → BXT → Apply | la imagen cambia (más nítida), sin error |
| G4 | **NoiseXTerminator ejecuta** | Noise Reduction → NXT → Apply | ruido baja, sin error |
| G5 | Interacción de secciones | expandir/colapsar pestañas, cambiar de algoritmo en un desplegable | responde, sin congelarse |
| G6 | Máscara activa | generar máscara (Range) → “Usar esta máscara” → aplicar NR | el NR respeta la máscara |
| G7 | Compare (mosaico) | botón Compare en NR o Sharpening | genera el mosaico de variantes en slots de memoria |
| G8 | CabraMagic (si flag ON) | ejecutar CabraMagic sobre la imagen | produce un “Final” válido usando las tools reales |
| G9 | Cancelar / cerrar ✕ | cerrar el diálogo modal | cierra limpio, sin ventanas huérfanas |

## Cómo se registra el resultado
Durante la sesión de control se anota PASS/FALLO por caso + captura si algo falla, y el resumen se añade a
`e2e_report.md` bajo una sección **“## 🖥️ GUI (computer-use)”** con la fecha. Lo que no se pueda ejecutar (tool
no instalada, sin licencia) se marca SKIP con el motivo.

## Resultados — sesión 2026-07-08 (computer-use, build 29, imagen RGB_LDu_2.xisf 6812×4803)
Ejecutado tomando el control del PC (PixInsight abierto por Claude, script Dev_200 cargado, imagen abierta).

| # | Caso | Resultado | Evidencia |
|---|------|-----------|-----------|
| G1 | Script carga en GUI | ✅ **PASS** | Compile & Run → diálogo "PI Workflow V8" abre; consola `Dependency Check: OK=10 WARN=2 ERROR=0`; cabecera muestra **build 29** (confirma el bump). Los 2 WARN son iconos opcionales SPFC/MGC (Gaia/MARS), esperados. |
| G3 | **BlurXTerminator ejecuta** | ✅ **PASS** | Pre Procesado → asignar RGB (MasterLight) → Procesar RGB → Deconvolución (BXT) → aplicar. Consola: `RC-Astro BlurXTerminator, version 2.0.4 … Processing: done … 15.344 s`. **Sin error `executeOn returned false`** → confirma que el arreglo build 28/29 NO rompe el camino feliz; la tool ejecuta y produce candidato. |
| G5 | Interacción del diálogo | ✅ **PASS** | Cambio de pestañas (Pre↔Post), expandir/colapsar secciones, desplegables, asignación de imagen y selección de algoritmo: todo responde. |
| G9 | Cerrar ✕ | ✅ **PASS** | El diálogo modal cierra limpio, vuelve a "Ready", sin ventanas huérfanas ni excepción. |
| — | Manejo de error | ✅ **PASS** | Aplicar Deconvolución sin imagen de trabajo → **MessageBox** limpio "Deconvolution: Select a workflow image first" (no crash). Buen gating. |
| G2 | StarXTerminator ejecuta | ⏳ no ejecutado esta sesión | Mismo wrapper `optAssertExecuteOk(sxt.executeOn(...))` (cabramagic.js) que BXT, que pasó. Alta confianza; pendiente de driving completo si se quiere cobertura exhaustiva. |
| G4 | NoiseXTerminator ejecuta | ⏳ no ejecutado esta sesión | Mismo patrón en post.js; requiere re-seleccionar imagen en Post + ~15 s. Pendiente. |
| G6/G7/G8 | Máscara / Compare / CabraMagic | ⏳ no ejecutados | Pendientes de una sesión enfocada. |

**Conclusión:** el punto crítico que headless no puede probar —**que una tool de IA RC-Astro ejecuta de verdad en la GUI y que el guardia `optAssertExecuteOk` del build 28/29 no rompe el camino feliz**— queda **CONFIRMADO** con BXT (v2.0.4, 15.3 s, candidato válido). G2/G4 comparten el mismo helper de una línea, así que la confianza es alta; se pueden driving por completo en una sesión dedicada.

**Nota menor detectada:** el comentario-cabecera del script (`PI Workflow.js`, línea ~12) aún dice "build 27" — es un docstring estático desactualizado; el `var OPT_BUILD` real es 29 y la cabecera del diálogo lo muestra bien. Cosmético (no toca lógica).

## Nota importante sobre AI tools headless vs GUI
El arreglo del build 28/29 (`optAssertExecuteOk`) hace que un fallo de estas tools **lance** en vez de pasar
desapercibido. En GUI (con GPU) deben ejecutar y devolver `true`; si en GUI alguna lanzara el error
“executeOn returned false”, sería un problema real de esa instalación (GPU/licencia) a investigar — justamente
lo que este test GUI sirve para detectar.
