import os
import zipfile
import hashlib
import datetime

# Define paths
base_dir = os.path.dirname(os.path.abspath(__file__))
zip_name = "PI-Workflow.zip"
zip_path = os.path.join(base_dir, zip_name)
xri_path = os.path.join(base_dir, "updates.xri")

# Files to include in the zip
files_to_include = [
    "PI Workflow.js",
    "PI Workflow_UI.js",
    "PI Workflow_resources.jsh",
    "PI Workflow_help.xhtml",
    "PI Workflow.svg"
]

print("1. Creando el archivo ZIP con la estructura para PixInsight...")
# Create ZIP with src/scripts/ structure using forward slashes for zip internal paths
with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
    for f in files_to_include:
        f_path = os.path.join(base_dir, f)
        if os.path.exists(f_path):
            # Write inside src/scripts/ in the zip using forward slashes
            zip_arcname = "src/scripts/" + f
            zipf.write(f_path, zip_arcname)
            print(f"   Añadido: {f} -> {zip_arcname}")
        else:
            print(f"   ERROR: No se encontró el archivo {f}")

print("\n2. Calculando el hash SHA-1 del archivo ZIP...")
# Calculate SHA-1 hash of the ZIP
sha1 = hashlib.sha1()
with open(zip_path, 'rb') as f:
    while chunk := f.read(8192):
        sha1.update(chunk)
sha1_hash = sha1.hexdigest()
print(f"   SHA-1: {sha1_hash}")

# Get release date in YYYYMMDD
release_date = datetime.date.today().strftime("%Y%m%d")

print("\n3. Generando el archivo updates.xri...")
xri_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
   <description>
      <p>
         <b>PI Workflow Repository</b> - Automated and optimized PixInsight processing workflow script.
      </p>
   </description>
   <platform os="all" arch="noarch" version="1.8.8:1.9.9">
      <package fileName="{zip_name}"
               sha1="{sha1_hash}"
               type="script"
               releaseDate="{release_date}">
         <title>PI Workflow Script Suite</title>
         <description>
             <p>
                PI Workflow is a comprehensive astrophotography processing interface that unifies the entire post-processing pipeline into a single environment. It offers One Preview to Rule Them All: A single, high-performance, interactive preview panel shared across all tabs and tools. It also add new and powerful comparison toolslike  Interactive Split-Screen (Split View), Multi-Algorithm Comparison Grid and 8-Slot of Transient Memory. Enjoy
             </p>
         </description>
      </package>
   </platform>
</xri>
"""

with open(xri_path, 'w', encoding='utf-8') as f:
    f.write(xri_content)
print(f"   Archivo updates.xri generado con éxito en {xri_path}")

print("\n¡Listo! Ahora puedes hacer git commit y git push de PI-Workflow.zip y updates.xri.")
