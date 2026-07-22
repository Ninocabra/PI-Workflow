# Guía de Publicación de PI Workflow en PixInsight vía GitHub

Esta guía explica paso a paso cómo publicar el script **PI Workflow** en tu repositorio de GitHub para que cualquier usuario de PixInsight pueda instalarlo y recibir actualizaciones automáticas.

---

## 🛠️ Cómo funciona el sistema de actualizaciones de PixInsight

PixInsight utiliza un archivo de manifiesto XML llamado `updates.xri`. Cuando un usuario agrega tu repositorio a su PixInsight:
1. PixInsight lee el archivo `updates.xri` desde tu URL de GitHub.
2. Compara la fecha de lanzamiento y la versión con la que tiene instalada localmente.
3. Si hay una versión más nueva, descarga el archivo empaquetado `.zip` (que contiene la estructura de carpetas `src/scripts/`), lo descomprime en el directorio de instalación de PixInsight y solicita reiniciar el programa.

Para facilitarte la vida, hemos creado un script de automatización llamado `build_package.py` en la raíz de tu repositorio `Para publicar`.

---

## 📦 Paso 1: Generar el paquete de distribución (¡Ya hecho para esta versión!)

Cada vez que quieras publicar cambios:
1. Asegúrate de copiar los archivos modificados desde la carpeta de desarrollo (`Test Antigravity`) a la carpeta de publicación (`Para publicar`).
2. Abre una terminal en `Para publicar` y ejecuta el script de empaquetado:
   ```powershell
   python build_package.py
   ```
   *Este script hace lo siguiente de forma automática:*
   * Crea un archivo `PI-Workflow.zip` con la estructura correcta que PixInsight espera (`src/scripts/...`).
   * Calcula el hash criptográfico **SHA-1** del ZIP (esencial, PixInsight rechaza la descarga si el hash no coincide exactamente).
   * Genera el archivo de manifiesto `updates.xri` con el nuevo hash, el nombre del archivo ZIP y la fecha de hoy.

---

## 🚀 Paso 2: Subir los archivos a tu repositorio de GitHub

Dado que ya hemos generado y preparado (staged) los archivos modificados y de empaquetado, solo tienes que confirmar los cambios y subirlos (push) a tu repositorio:

1. Abre **PowerShell** o tu terminal preferida.
2. Ve al directorio de publicación:
   ```powershell
   cd "c:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\Claude\OPT\Para publicar"
   ```
3. Realiza el commit de los cambios preparados:
   ```powershell
   git commit -m "release: v34-param-model-v1 con Slider de Comparación Dividida, Exportación Global e integraciones"
   ```
4. Sube los archivos a GitHub:
   ```powershell
   git push origin main
   ```

---

## 🌐 Paso 3: Configurar GitHub Pages para tu Repositorio (Recomendado)

Aunque es posible usar enlaces directos tipo "raw" de GitHub, **GitHub Pages** es el estándar de la industria. Proporciona una URL HTTPS limpia, rápida y compatible con el gestor de descargas de PixInsight, evitando bloqueos por políticas de seguridad (CORS).

1. Abre tu navegador e ingresa a tu repositorio: [https://github.com/Ninocabra/PI-Workflow](https://github.com/Ninocabra/PI-Workflow)
2. En la parte superior de la página del repositorio, haz clic en **Settings** (Configuración ⚙️).
3. En la barra lateral izquierda, baja hasta la sección **Code and automation** y haz clic en **Pages**.
4. En la sección **Build and deployment**:
   * **Source:** Selecciona `Deploy from a branch`.
   * **Branch:** Selecciona `main` y en la carpeta de al lado selecciona `/ (root)` (la raíz).
   * Haz clic en **Save** (Guardar).
5. Espera aproximadamente 1 minuto. Recarga la página y verás un mensaje arriba diciendo:
   > *Your site is live at:* `https://ninocabra.github.io/PI-Workflow/`

**Esta URL (`https://ninocabra.github.io/PI-Workflow/`) es el enlace oficial de tu repositorio de PixInsight.**

---

## 🖥️ Paso 4: Cómo deben instalarlo los usuarios en PixInsight

Cualquier usuario de PixInsight (incluyéndote a ti para probar la instalación automática) puede instalar tu script siguiendo estos pasos dentro de PixInsight:

1. Abre PixInsight.
2. Ve al menú superior: **Resources > Updates > Manage Repositories** (Recursos > Actualizaciones > Administrar repositorios).
3. Haz clic en el botón **Add** (Añadir).
4. Pega la URL de tu GitHub Pages:
   ```text
   https://ninocabra.github.io/PI-Workflow/
   ```
5. Haz clic en **OK** y luego otra vez en **OK** para cerrar el administrador.
6. Ve al menú superior: **Resources > Updates > Check for Updates** (Recursos > Actualizaciones > Buscar actualizaciones).
7. PixInsight se conectará a tu servidor, detectará el paquete y mostrará una ventana confirmando que se ha encontrado la actualización de **PI Workflow Script Suite**. Haz clic en **Apply** (Aplicar).
8. **Reinicia PixInsight.** Al abrirse de nuevo, el script estará instalado en el menú **Script > Utilities > PI Workflow** (o la sección que le corresponda).

---

## 🔄 Flujo para futuras actualizaciones (Ahorro de tiempo)

Cuando hagas mejoras en el futuro y decidas lanzar una nueva versión, el proceso será súper rápido:

1. Modificas los archivos en la carpeta de desarrollo (`Test Antigravity`).
2. Cuando estés contento, los copias a `Para publicar` (sobrescribiendo los viejos).
3. **Documentas la versión en el CHANGELOG** (ver aviso de abajo — es lo que sincroniza la web).
4. Ejecutas en tu terminal:
   ```powershell
   python build_package.py
   ```
5. Confirmas y subes a GitHub:
   ```powershell
   git add .
   git commit -m "release: nueva version X.X.X con mejoras..."
   git push origin main
   ```
¡Y listo! Al cabo de 1 minuto, todos los usuarios que tengan tu URL en PixInsight recibirán una notificación automática para actualizar el script la próxima vez que abran el programa.

---

## 📝 IMPORTANTE: actualiza SOLO el `CHANGELOG.md` (el resto es automático)

La sección **Novedades** de la web ([cabraspace.com/cabrascripts.html#pi-workflow](https://cabraspace.com/cabrascripts.html#pi-workflow)) **se actualiza sola** leyendo en vivo el CHANGELOG de este repo. No hay que tocar la web ni el español a mano.

**En cada versión nueva, añade el bloque de la versión ARRIBA DEL TODO en `CHANGELOG.md`** (inglés). Con eso basta:

- Al hacer push a `main`, el workflow **`translate-changelog`** (`.github/workflows/translate-changelog.yml`) traduce automáticamente ese bloque al español con GitHub Models y committea `CHANGELOG.es.md`. La página ES sale en español sola (~5 min).
- **No edites `CHANGELOG.es.md` para la última versión**: se regenera. (Sí puedes retocar a mano bloques de versiones anteriores; el workflow solo toca el bloque de la versión más reciente.)
- Si el workflow fallara, la web no se rompe: la página ES muestra el inglés de esa versión hasta que se regenere el español.

**Formato del bloque en `CHANGELOG.md`** (respétalo para que el parser de la web y el traductor lo lean bien):

```markdown
## [X.X] - AAAA-MM-DD

Optional intro paragraph.

### Added
- **Bold term** — description. Paths or flags in `code`.

### Fixed
- **Another term** — description.
```

> El traductor mapea los títulos habituales (`Added` → Novedades, `Fixed` → Bugs resueltos, `Changed` → Cambios, etc.) y respeta negritas, `código` y nombres técnicos (BlurXTerminator, plate solve…). Reglas del parser de la web: renderiza **solo el primer bloque** `## [...]`; las viñetas admiten `**negrita**` y `` `código` ``; el badge de versión de la web se sincroniza con el número entre corchetes.

La latencia es de ~5 minutos (caché del CDN de GitHub). Los cambios llegan sin build ni despliegue de la web.
