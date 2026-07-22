#!/usr/bin/env python3
"""Traduce automaticamente al espanol el ultimo bloque de version de CHANGELOG.md
y lo antepone a CHANGELOG.es.md.

Lo ejecuta el workflow .github/workflows/translate-changelog.yml usando GitHub Models
(inferencia LLM gratuita con el GITHUB_TOKEN del repo). Solo traduce el bloque de la
version mas reciente: si CHANGELOG.es.md ya esta en esa version, no hace nada, asi que
las entradas en espanol ya existentes (escritas a mano o traducidas antes) no se tocan.

La linea de titulo `## [version] - fecha` se copia TAL CUAL del ingles (no se traduce),
para que el numero de version coincida exactamente y la web muestre el bloque en espanol.
"""
import json
import os
import re
import sys
import urllib.error
import urllib.request

SRC = "CHANGELOG.md"
DST = "CHANGELOG.es.md"

ENDPOINT = os.environ.get(
    "MODELS_ENDPOINT", "https://models.github.ai/inference/chat/completions"
)
MODEL = os.environ.get("TRANSLATE_MODEL", "openai/gpt-4o-mini")
TOKEN = os.environ.get("GITHUB_TOKEN", "")

PREAMBLE = (
    "# Changelog\n\n"
    "Todos los cambios relevantes de PI Workflow se documentan aqui.\n\n"
    "> Este archivo es la version en espanol de `CHANGELOG.md`. El bloque de la ultima\n"
    "> version lo genera automaticamente el workflow `translate-changelog` (GitHub\n"
    "> Models). La web de CabraSpace lee el ultimo bloque desde aqui. Para la ultima\n"
    "> version, edita `CHANGELOG.md` (ingles): el espanol se regenera solo.\n"
)

SYSTEM = (
    "Eres un traductor tecnico. Traduces al espanol de Espana fragmentos de un CHANGELOG "
    "de un software de astrofotografia (PI Workflow, un script para PixInsight). Reglas "
    "ESTRICTAS:\n"
    "1. Conserva EXACTAMENTE el formato Markdown: vinetas que empiezan por '- ', "
    "encabezados '### ', negritas '**...**' y spans de codigo entre backticks `...`.\n"
    "2. NO traduzcas ni alteres: nombres propios, identificadores de codigo, nombres de "
    "archivo, rutas, flags (p. ej. -i/-o/-v), ni terminos tecnicos como BlurXTerminator, "
    "StarXTerminator, NoiseXTerminator, DeepSNR, StarNet2, SyQon, Starless, Parallax, "
    "Prism, plate solve, plate-solve, GraXpert, SPCC, TIFF, FITS, GPU, CPU, build.\n"
    "3. Traduce los titulos de seccion al termino habitual de un changelog en espanol: "
    "'Added' -> 'Novedades', 'Fixed' -> 'Bugs resueltos', 'Changed' -> 'Cambios', "
    "'Removed' -> 'Eliminado', 'Docs' -> 'Documentacion', 'Improved' -> 'Mejoras', "
    "'Notes' -> 'Notas', 'Performance' -> 'Rendimiento'. Si el titulo lleva un sufijo tras "
    "un guion largo (p. ej. 'Changed - architecture'), traduce tambien el sufijo "
    "('Cambios - arquitectura').\n"
    "4. Devuelve UNICAMENTE el Markdown traducido. NO anadas la linea de titulo de version "
    "(## [..]), ni comentarios, ni delimitadores de bloque de codigo (```)."
)


def first_block(text):
    """Devuelve (heading_line, block_text, version) de la primera seccion '## ['."""
    lines = text.replace("\r", "").split("\n")
    start = None
    for i, line in enumerate(lines):
        if line.startswith("## ["):
            start = i
            break
    if start is None:
        return None, None, None
    end = len(lines)
    for j in range(start + 1, len(lines)):
        if lines[j].startswith("## "):
            end = j
            break
    block = "\n".join(lines[start:end]).rstrip()
    heading = lines[start]
    m = re.match(r"^##\s+\[(.+?)\]", heading)
    version = m.group(1).strip() if m else ""
    return heading, block, version


def top_version(path):
    if not os.path.exists(path):
        return None
    with open(path, encoding="utf-8") as f:
        _, _, v = first_block(f.read())
    return v


def translate_body(body):
    if not TOKEN:
        sys.stderr.write("ERROR: falta GITHUB_TOKEN en el entorno.\n")
        sys.exit(1)
    payload = {
        "model": MODEL,
        "temperature": 0,
        "messages": [
            {"role": "system", "content": SYSTEM},
            {"role": "user", "content": body},
        ],
    }
    req = urllib.request.Request(
        ENDPOINT, data=json.dumps(payload).encode("utf-8"), method="POST"
    )
    req.add_header("Authorization", "Bearer " + TOKEN)
    req.add_header("Content-Type", "application/json")
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            out = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", "replace")
        sys.stderr.write("HTTPError %s en %s:\n%s\n" % (e.code, ENDPOINT, detail))
        sys.exit(1)
    except urllib.error.URLError as e:
        sys.stderr.write("URLError: %s\n" % e)
        sys.exit(1)
    try:
        content = out["choices"][0]["message"]["content"]
    except (KeyError, IndexError):
        sys.stderr.write("Respuesta inesperada del modelo:\n%s\n" % json.dumps(out)[:2000])
        sys.exit(1)
    # Por si el modelo envuelve la salida en ``` a pesar de la instruccion.
    content = content.strip()
    content = re.sub(r"^```[a-zA-Z]*\n", "", content)
    content = re.sub(r"\n```$", "", content)
    return content.strip()


def main():
    if not os.path.exists(SRC):
        print("No existe %s; nada que hacer." % SRC)
        return
    with open(SRC, encoding="utf-8") as f:
        heading, block, version = first_block(f.read())
    if not heading:
        print("No se encontro ningun bloque '## [..]' en %s." % SRC)
        return
    if top_version(DST) == version:
        print("%s ya esta en la version %s; nada que traducir." % (DST, version))
        return

    body = block[len(heading):].lstrip("\n")
    translated = translate_body(body)
    es_block = heading + "\n\n" + translated.strip() + "\n"

    if os.path.exists(DST):
        with open(DST, encoding="utf-8") as f:
            es = f.read().replace("\r", "")
        idx = es.find("\n## [")
        if idx == -1:
            new = es.rstrip() + "\n\n" + es_block
        else:
            preamble = es[:idx].rstrip()
            rest = es[idx + 1:].lstrip("\n")  # +1 para saltar el \n inicial
            new = preamble + "\n\n" + es_block + "\n" + rest
    else:
        new = PREAMBLE.rstrip() + "\n\n" + es_block

    with open(DST, "w", encoding="utf-8") as f:
        f.write(new.rstrip() + "\n")
    print("Escrito %s para la version %s." % (DST, version))


if __name__ == "__main__":
    main()
