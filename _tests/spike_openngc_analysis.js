// ============================================================================
// spike_openngc_analysis.js — Fase 0 / feature #13 (anotacion "que hay en mi imagen")
// ----------------------------------------------------------------------------
// Spike NODE (no PixInsight). Valida el pipeline del catalogo DSO local OpenNGC:
//   1. parse del CSV (;-separado)  2. RA/Dec sexagesimal -> grados
//   3. clasificacion Type -> categoria  4. cone-search por FoV (haversine)
//   5. conteos por categoria y por limite de magnitud (= el "slider de profundidad")
// El objetivo real: numeros para dimensionar el slider y el declutter, y probar
// que el "peor caso" (cumulo de Virgo) se doma con el limite de magnitud.
//
// Uso:  node _tests/spike_openngc_analysis.js
// ============================================================================
"use strict";
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "catalogs");

// --- Type (OpenNGC) -> categoria (ES). Los que no interesan -> null (excluir). --
function classify(type) {
   switch (type) {
      case "G": case "GPair": case "GTrpl": case "GGroup": return "Galaxias";
      case "PN":   return "Nebulosas planetarias";
      case "SNR":  return "Restos de supernova";
      case "HII": case "Neb": case "RfN": case "EmN": case "Cl+N": return "Nebulosas";
      case "DrkN": return "Nebulosas oscuras";
      case "OCl":  return "Cumulos abiertos";
      case "GCl":  return "Cumulos globulares";
      case "*": case "**": case "*Ass": return "Estrellas/asterismos";
      case "Nova": return "Novas";
      case "Dup": case "NonEx": case "Other": case "": return null; // excluir
      default:     return "Otros";
   }
}

function hmsToDeg(s) { // "HH:MM:SS.ss" -> grados
   if (!s) return null;
   const p = s.split(":"); if (p.length < 3) return null;
   const h = +p[0], m = +p[1], sec = +p[2];
   if (![h, m, sec].every(isFinite)) return null;
   return (h + m / 60 + sec / 3600) * 15;
}
function dmsToDeg(s) { // "+DD:MM:SS.s" -> grados
   if (!s) return null;
   const sign = s.trim()[0] === "-" ? -1 : 1;
   const p = s.replace(/^[+-]/, "").split(":"); if (p.length < 3) return null;
   const d = +p[0], m = +p[1], sec = +p[2];
   if (![d, m, sec].every(isFinite)) return null;
   return sign * (d + m / 60 + sec / 3600);
}
function angSep(ra1, de1, ra2, de2) { // grados, haversine
   const R = Math.PI / 180;
   const a = Math.sin((de2 - de1) * R / 2) ** 2 +
             Math.cos(de1 * R) * Math.cos(de2 * R) * Math.sin((ra2 - ra1) * R / 2) ** 2;
   return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / R;
}

function parseCsv(file, rows) {
   const txt = fs.readFileSync(file, "utf8");
   const lines = txt.split(/\r?\n/);
   const header = lines[0].split(";");
   const idx = {};
   header.forEach((h, i) => idx[h.trim()] = i);
   for (let i = 1; i < lines.length; ++i) {
      if (!lines[i]) continue;
      const c = lines[i].split(";");
      const type = (c[idx["Type"]] || "").trim();
      const cat = classify(type);
      if (cat === null) continue;                      // Dup/NonEx/Other excluidos
      const ra = hmsToDeg(c[idx["RA"]]);
      const dec = dmsToDeg(c[idx["Dec"]]);
      if (ra === null || dec === null) continue;       // sin coords utiles
      const v = parseFloat(c[idx["V-Mag"]]);
      const b = parseFloat(c[idx["B-Mag"]]);
      const mag = isFinite(v) ? v : (isFinite(b) ? b : null);
      const maj = parseFloat(c[idx["MajAx"]]);          // arcmin
      rows.push({ name: (c[idx["Name"]] || "").trim(), type, cat, ra, dec,
                  mag, size: isFinite(maj) ? maj : null,
                  common: (c[idx["Common names"]] || "").trim() });
   }
}

// ---------------------------------------------------------------------------
const rows = [];
parseCsv(path.join(DIR, "NGC.csv"), rows);
try { parseCsv(path.join(DIR, "addendum.csv"), rows); } catch (e) {}

console.log("=".repeat(78));
console.log("OpenNGC — resumen del catalogo (tras excluir Dup/NonEx/Other)");
console.log("=".repeat(78));
console.log("Objetos utiles:", rows.length);

const byCat = {}, withMag = {}, withSize = {};
for (const r of rows) {
   byCat[r.cat] = (byCat[r.cat] || 0) + 1;
   if (r.mag !== null) withMag[r.cat] = (withMag[r.cat] || 0) + 1;
   if (r.size !== null) withSize[r.cat] = (withSize[r.cat] || 0) + 1;
}
console.log("\nPor categoria (total | con magnitud | con tamaño):");
Object.keys(byCat).sort((a, b) => byCat[b] - byCat[a]).forEach(cat =>
   console.log("  " + cat.padEnd(24) + String(byCat[cat]).padStart(6) +
      " | " + String(withMag[cat] || 0).padStart(6) + " | " + String(withSize[cat] || 0).padStart(6)));

// ---------------------------------------------------------------------------
// Cone-search en campos reales, con conteo por categoria y por profundidad.
const fields = [
   { name: "M42 / Orion (nebulosa)",      ra: 83.8221,  dec: -5.3911 },
   { name: "M31 / Andromeda (galaxia)",   ra: 10.6847,  dec: 41.2687 },
   { name: "M45 / Pleiades (cumulo)",     ra: 56.75,    dec: 24.1167 },
   { name: "Cumulo de VIRGO (peor caso)", ra: 187.70,   dec: 12.39 }
];
const radii = [1.5, 0.75];       // grados (FoV tipico refractor / SCT)
const magLimits = [8, 10, 12, 14, 16, 99]; // 99 = sin limite (incluye sin-mag)

function inCone(r, f, radius) { return angSep(f.ra, f.dec, r.ra, r.dec) <= radius; }
function passMag(r, lim) { return lim >= 99 ? true : (r.mag !== null && r.mag <= lim); }

for (const f of fields) {
   console.log("\n" + "=".repeat(78));
   console.log("CAMPO: " + f.name + "   (RA " + f.ra.toFixed(3) + ", Dec " + f.dec.toFixed(3) + ")");
   console.log("=".repeat(78));
   for (const radius of radii) {
      const inFov = rows.filter(r => inCone(r, f, radius));
      console.log("\n  Radio " + radius + " deg  (objetos totales en FoV: " + inFov.length + ")");
      console.log("  Limite mag ->     " + magLimits.map(m => (m >= 99 ? "todos" : "<=" + m).padStart(7)).join(""));
      const cats = {};
      for (const r of inFov) cats[r.cat] = true;
      // fila TOTAL
      console.log("  " + "TOTAL etiquetables".padEnd(24) +
         magLimits.map(m => String(inFov.filter(r => passMag(r, m)).length).padStart(7)).join(""));
      // por categoria
      Object.keys(cats).sort().forEach(cat => {
         const sub = inFov.filter(r => r.cat === cat);
         console.log("  " + ("  " + cat).padEnd(24) +
            magLimits.map(m => String(sub.filter(r => passMag(r, m)).length).padStart(7)).join(""));
      });
   }
}
console.log("\n" + "=".repeat(78));
console.log("LECTURA: la columna 'todos' de Virgo es el riesgo de saturacion; ver como");
console.log("el limite de magnitud (= slider de profundidad) lo reduce a algo legible.");
console.log("=".repeat(78));
