# Guía de Publicación en GitHub para Claude Code

Este documento sirve como instrucción directa para que **Claude Code** realice el empaquetado y la publicación de nuevas versiones del script **PI Workflow** desde la carpeta de publicación (`Para publicar`) hasta GitHub.

---

## 📋 Contexto y Flujo de Trabajo

La carpeta de publicación se encuentra en:
`c:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\Claude\OPT\Para publicar`

Cuando los archivos modificados (`PI Workflow.js`, `PI Workflow_UI.js`, etc.) ya han sido copiados a esta carpeta, el procedimiento exacto para empaquetar, firmar y actualizar GitHub es el siguiente:

---

## 🛠️ Paso 1: Re-generar la Documentación y el Paquete de PixInsight

1. **Compilar la Documentación**: Si has realizado algún cambio en `PI Workflow_help.xhtml`, debes compilar la documentación oficial en formato `PIScriptDoc` (`PI_Workflow.html`) ejecutando:
   ```powershell
   python scratch/build_doc.py
   ```
   *Esto generará `PI_Workflow.html` tanto en la carpeta de desarrollo (`Test Antigravity`) como en la de publicación (`Para publicar`) bajo `doc/scripts/PI_Workflow/`.*

2. **Empaquetar y Generar Manifiesto**: PixInsight requiere que los archivos estén estructurados en un ZIP y declarados en un archivo de manifiesto XML llamado `updates.xri`. PixInsight verifica estrictamente el hash criptográfico **SHA-1** del archivo ZIP; si no coincide, rechaza la instalación.
   Ejecuta el script de empaquetado `build_package.py` que está en la raíz de `Para publicar`:
   ```powershell
   python build_package.py
   ```

Este script de Python realiza de forma automática las siguientes acciones:
- Crea/actualiza `PI-Workflow.zip` empaquetando los ficheros en la estructura interna requerida (`src/scripts/...`) y la documentación oficial (`doc/scripts/PI_Workflow/...`).
- Calcula el hash **SHA-1** del archivo ZIP generado.
- Escribe y actualiza el archivo `updates.xri` con el nuevo hash SHA-1 y la fecha actual en formato `YYYYMMDD`.

---

## 🔍 Paso 2: Verificación de Estado y Cambios en Git

Antes de confirmar (commit), es importante verificar qué archivos han cambiado para evitar incluir archivos temporales o de depuración no deseados.

1. Ejecuta `git status` en la carpeta `Para publicar`:
   ```powershell
   git status
   ```
2. Deberías ver modificados como mínimo:
   - `PI Workflow_UI.js` (u otros scripts modificados)
   - `doc/scripts/PI_Workflow/PI_Workflow.html` (si se actualizó la ayuda)
   - `PI-Workflow.zip` (el paquete comprimido regenerado)
   - `updates.xri` (el manifiesto actualizado con el nuevo hash)

---

## 🚀 Paso 3: Preparar, Confirmar y Subir a GitHub

Una vez validado el estado de Git, se procede a indexar y subir los cambios a la rama principal:

1. Indexa únicamente los archivos de distribución (evita subir archivos `scratch_combined.js` u otros temporales):
   ```powershell
   git add "PI Workflow.js" "PI Workflow_UI.js" "PI Workflow_resources.jsh" "PI Workflow_help.xhtml" "doc/scripts/PI_Workflow/PI_Workflow.html" "PI-Workflow.zip" "updates.xri"
   ```
   *(O alternativamente, si no hay basura en el directorio: `git add .`)*


2. Crea el commit con una descripción clara del cambio (por ejemplo, siguiendo Conventional Commits):
   ```powershell
   git commit -m "fix: corrige reentrada en SPCC y revierte ajustes de sesión"
   ```

3. Sube los cambios al repositorio remoto en la rama principal (`main` o `principal`):
   ```powershell
   git push origin main
   ```

---

## 🖥️ Paso 4: Publicar el Script Monolítico en el Directorio Local (Opcional)

Si el usuario también ejecuta el script de forma local directamente desde el archivo monolítico (combinado) en la carpeta principal `c:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\PI Workflow.js`, se puede compilar el nuevo archivo combinado inyectando los recursos y la UI.

Puedes indicarle a Claude Code que ejecute el compilador local (`build_combined.py`) que genera este archivo único:
```powershell
python C:\Users\ninoc\.gemini\antigravity\scratch\build_combined.py
```
Y luego validar la sintaxis de corchetes del archivo resultante para garantizar que cargue sin fallos en PixInsight:
```powershell
python -c "import sys; sys.path.append(r'C:\Users\ninoc\.gemini\antigravity\brain\2019eb6d-1411-41f5-a687-7e5ad1f663ae\scratch'); import check_syntax; check_syntax.check_matching_brackets(r'c:\Users\ninoc\Documents\PixInsight\Test_Scripts\PI Workflow\PI Workflow.js')"
```

---

## 🏁 Verificación Final en PixInsight
Una vez que el push se ha completado en GitHub:
1. GitHub Pages tardará aproximadamente **1 minuto** en actualizar el sitio web estático (`https://ninocabra.github.io/PI-Workflow/`).
2. En PixInsight, ve a **Resources > Updates > Check for Updates**.
3. PixInsight leerá el nuevo `updates.xri`, detectará el cambio de versión/fecha, descargará `PI-Workflow.zip`, validará su SHA-1 y te solicitará reiniciar para aplicar la actualización limpia.
