import os
import zipfile
import hashlib
import datetime

# Option B — version-routed distribution (one repo, two packages):
#   PixInsight <= 1.9.3  -> PI-Workflow-193.zip  (FROZEN V8_5 dual build; never
#                                                 rebuilt here, only re-hashed)
#   PixInsight >= 1.9.4  -> PI-Workflow-194.zip  (V8-only build, rebuilt from the
#                                                 source files in this folder)
# PixInsight reads updates.xri and picks the package whose <platform> version
# range matches the running core, so both versions resolve from the same URL.

base_dir = os.path.dirname(os.path.abspath(__file__))
xri_path = os.path.join(base_dir, "updates.xri")

zip_193_name = "PI-Workflow-193.zip"
zip_194_name = "PI-Workflow-194.zip"
zip_193_path = os.path.join(base_dir, zip_193_name)
zip_194_path = os.path.join(base_dir, zip_194_name)

# Frozen 1.9.3 package release date (do NOT change; it is the V8_5 build).
release_date_193 = "20260608"

files_to_include = [
    "PI Workflow.js",
    "PI Workflow_UI.js",
    "PI Workflow_resources.jsh",
    "PI Workflow_help.xhtml",
    "PI Workflow.svg",
]
doc_files_to_include = [
    "doc/scripts/PI_Workflow/PI_Workflow.html",
]


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        while chunk := f.read(8192):
            h.update(chunk)
    return h.hexdigest()


# 1) Build the 1.9.4 (V8-only) package from the source files in this folder.
print("1. Construyendo PI-Workflow-194.zip (build V8-only para PixInsight 1.9.4+)...")
with zipfile.ZipFile(zip_194_path, "w", zipfile.ZIP_DEFLATED) as zipf:
    for f in files_to_include:
        p = os.path.join(base_dir, f)
        if os.path.exists(p):
            zipf.write(p, "src/scripts/" + f)
            print(f"   Añadido: {f} -> src/scripts/{f}")
        else:
            print(f"   ERROR: no se encontró {f}")
    for f in doc_files_to_include:
        p = os.path.join(base_dir, f)
        if os.path.exists(p):
            zipf.write(p, f)
            print(f"   Añadido: {f} -> {f}")
        else:
            print(f"   ERROR: no se encontró {f}")

sha1_194 = sha1_of(zip_194_path)
print(f"   SHA-1 (194): {sha1_194}")

# 2) The 1.9.3 package is FROZEN: only re-hash it, never rebuild it.
if not os.path.exists(zip_193_path):
    raise SystemExit(f"ERROR: falta el paquete congelado {zip_193_name} (build V8_5 para 1.9.3).")
sha1_193 = sha1_of(zip_193_path)
print(f"\n2. Paquete 1.9.3 CONGELADO: {zip_193_name}  SHA-1: {sha1_193}")

release_date_194 = datetime.date.today().strftime("%Y%m%d")

# 3) Generate updates.xri with two version-routed platforms.
print("\n3. Generando updates.xri (version-routed, dos paquetes)...")
xri_content = f"""<?xml version="1.0" encoding="UTF-8"?>
<xri version="1.0">
   <description>
      <p>
         <b>PI Workflow Repository</b> - Automated and optimized PixInsight processing workflow script.
      </p>
   </description>
   <platform os="all" arch="noarch" version="1.8.8:1.9.3">
      <package fileName="{zip_193_name}"
               sha1="{sha1_193}"
               type="script"
               releaseDate="{release_date_193}">
         <title>PI Workflow Script Suite (PixInsight 1.9.3 and earlier)</title>
         <description>
             <p>
                PI Workflow - frozen build for PixInsight 1.9.3 and earlier (SpiderMonkey runtime). Maintained on the 1.9.4+ line only; this package is kept stable for legacy cores.
             </p>
         </description>
      </package>
   </platform>
   <platform os="all" arch="noarch" version="1.9.4:1.9.9">
      <package fileName="{zip_194_name}"
               sha1="{sha1_194}"
               type="script"
               releaseDate="{release_date_194}">
         <title>PI Workflow Script Suite (PixInsight 1.9.4+)</title>
         <description>
             <p>
                PI Workflow is a comprehensive astrophotography processing interface that unifies the entire post-processing pipeline into a single environment (V8 build for PixInsight 1.9.4+). One Preview to Rule Them All: a single, high-performance interactive preview shared across all tabs and tools, plus comparison tools (Split View, Multi-Algorithm Comparison Grid) and an 8-slot transient memory. Enjoy
             </p>
         </description>
      </package>
   </platform>
</xri>
"""

with open(xri_path, "w", encoding="utf-8") as f:
    f.write(xri_content)
print(f"   updates.xri generado en {xri_path}")

print("\n¡Listo! Commit y push de PI-Workflow-193.zip (congelado), PI-Workflow-194.zip y updates.xri.")
