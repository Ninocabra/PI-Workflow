// ===== ANNOTATIONS-BEGIN (feature #13: "que hay en mi imagen" — motor DSO) =====
// Motor de anotacion de objetos de cielo profundo (DSO) sobre la imagen activa.
// Fuente: catalogo LOCAL OpenNGC (catalogs/NGC.csv + addendum.csv, ~13k objetos)
// clasificado por su columna Type; las estrellas (Gaia) llegan en una fase
// posterior. El flujo:
//   1. optAnnLoadCatalog()            -> parsea+cachea el catalogo (una vez)
//   2. optAnnQueryImage(window, opts) -> objetos dentro de la imagen resuelta,
//                                        con px/py (coords de imagen full-res)
//   3. optAnnFilterByMagnitude(...)   -> aplica el "slider de profundidad"
//   4. optAnnDeclutterLabels(...)     -> elige que objetos llevan etiqueta
// La UI (ui/sections_annotations.js) mapea px/py -> coords del preview (zoom/pan)
// y pinta markers (todos) + etiquetas (las que sobreviven al declutter).
//
// Validado en Fase 0: window.celestialToImage es exacto al pixel; los DSO son
// pocos por campo (decenas, no miles) -> la sobrecarga de etiquetas la controla
// el limite de magnitud. Gated por OPT_ANNOTATIONS_ENABLED (release).
//
// Diseño: TODO son definiciones de funciones/datos (sin ejecucion top-level), y
// las funciones "puras" (classify/parse/angSep/filtro/declutter) no usan globals
// de PixInsight, para poder testearlas en node (_tests/ann_engine_test.js).
// Reversibilidad: borrar este fichero + su #include + el bloque de pestaña.

// El MajAx/MinAx del catalogo (isophotal estandar) suele quedar por debajo de la
// extension visible en una toma profunda -> agrandamos la elipse un poco para que
// englobe la galaxia/nebulosa. Ajustable.
var OPT_ANN_SIZE_FACTOR = 1.4;

// --- Modelo de categorias -------------------------------------------------
// Orden = orden de dibujo/leyenda. Color en 0xAARRGGBB (para Pen/Brush PJSR).
var OPT_ANN_CATEGORIES = [
   "Galaxias", "Nebulosas", "Nebulosas planetarias", "Restos de supernova",
   "Cumulos abiertos", "Cumulos globulares", "Nebulosas oscuras",
   "Estrellas/asterismos", "Otros"
];
var OPT_ANN_CATCOLOR = {
   "Galaxias":               0xffffc850,
   "Nebulosas":              0xff6ec8ff,
   "Nebulosas planetarias":  0xff8affc0,
   "Restos de supernova":    0xffff8080,
   "Cumulos abiertos":       0xffffe080,
   "Cumulos globulares":     0xffff80c0,
   "Nebulosas oscuras":      0xff9098b0,
   "Estrellas/asterismos":   0xffb8b8c0,
   "Otros":                  0xffa0a0a0
};

// OpenNGC Type -> categoria (ES). Devuelve null para lo que se excluye del todo
// (duplicados, inexistentes, "otros" sin utilidad de anotacion). Pura.
function optAnnClassify(type) {
   switch (type) {
      case "G": case "GPair": case "GTrpl": case "GGroup":     return "Galaxias";
      case "PN":                                               return "Nebulosas planetarias";
      case "SNR":                                              return "Restos de supernova";
      case "HII": case "Neb": case "RfN": case "EmN": case "Cl+N": return "Nebulosas";
      case "DrkN":                                             return "Nebulosas oscuras";
      case "OCl":                                              return "Cumulos abiertos";
      case "GCl":                                              return "Cumulos globulares";
      case "*": case "**": case "*Ass":                        return "Estrellas/asterismos";
      case "Dup": case "NonEx": case "Other": case "":         return null;
      default:                                                 return "Otros";
   }
}

// Subtipos (codigos Type de OpenNGC) que componen cada categoria, en orden.
// Alimenta los sub-desplegables por categoria (elegir subconjuntos, estilo
// SetiAstro pero agrupado). Solo las de >1 subtipo muestran flechita.
var OPT_ANN_SUBTYPES = {
   "Galaxias":              ["G", "GPair", "GTrpl", "GGroup"],
   "Nebulosas":             ["EmN", "RfN", "HII", "Cl+N", "Neb"],
   "Nebulosas planetarias": ["PN"],
   "Restos de supernova":   ["SNR"],
   "Cumulos abiertos":      ["OCl"],
   "Cumulos globulares":    ["GCl"],
   "Nebulosas oscuras":     ["DrkN"],
   "Estrellas/asterismos":  ["*", "**", "*Ass"],
   "Otros":                 []
};
// Nombre legible (ES) por codigo Type, para las etiquetas de los sub-checkboxes.
var OPT_ANN_TYPELABEL = {
   "G": "Galaxia", "GPair": "Par de galaxias", "GTrpl": "Triplete de galaxias",
   "GGroup": "Grupo de galaxias", "PN": "Nebulosa planetaria", "SNR": "Resto de supernova",
   "HII": "Region HII", "Neb": "Nebulosa", "RfN": "Nebulosa de reflexion",
   "EmN": "Nebulosa de emision", "Cl+N": "Cumulo + nebulosa", "DrkN": "Nebulosa oscura",
   "OCl": "Cumulo abierto", "GCl": "Cumulo globular", "*": "Estrella",
   "**": "Estrella doble", "*Ass": "Asociacion estelar", "Other": "Otro"
};

// --- i18n de DISPLAY: las categorias/subtipos son CLAVES internas en español
// (no se cambian, para no romper motor/tests). Para mostrarlos, la UI usa
// optT(optAnnCatLabelEN(cat)) -> literal inglés canónico -> ES via OPT_I18N_ES.
var OPT_ANN_CAT_EN = {
   "Galaxias": "Galaxies", "Nebulosas": "Nebulae", "Nebulosas planetarias": "Planetary nebulae",
   "Restos de supernova": "Supernova remnants", "Cumulos abiertos": "Open clusters",
   "Cumulos globulares": "Globular clusters", "Nebulosas oscuras": "Dark nebulae",
   "Estrellas/asterismos": "Stars/asterisms", "Otros": "Others"
};
var OPT_ANN_TYPELABEL_EN = {
   "G": "Galaxy", "GPair": "Galaxy pair", "GTrpl": "Galaxy triplet", "GGroup": "Galaxy group",
   "PN": "Planetary nebula", "SNR": "Supernova remnant", "HII": "HII region", "Neb": "Nebula",
   "RfN": "Reflection nebula", "EmN": "Emission nebula", "Cl+N": "Cluster + nebula",
   "DrkN": "Dark nebula", "OCl": "Open cluster", "GCl": "Globular cluster", "*": "Star",
   "**": "Double star", "*Ass": "Stellar association", "Other": "Other"
};
function optAnnCatLabelEN(cat) { return OPT_ANN_CAT_EN[cat] || cat; }
function optAnnTypeLabelEN(ty) { return OPT_ANN_TYPELABEL_EN[ty] || ty; }

// ¿pasa el objeto el filtro de subtipos? subActive = { categoria: { type: bool } }.
// Si la categoria no tiene entrada (o el type no esta listado) -> se muestra.
// Solo oculta cuando explicitamente esta a false. Pura.
function optAnnSubtypeActive(o, subActive) {
   if (!o || !subActive) return true;
   var m = subActive[o.cat];
   if (!m) return true;
   return m[o.type] !== false;
}

// --- Consulta ONLINE (Fase B): SIMBAD TAP. Funciones PURAS ----------------
// SIMBAD usa 'otype' (codigo compacto) mas rico que OpenNGC. Mapea a nuestras
// 9 categorias; null = se descarta (no ensuciar con tipos irrelevantes). Pura.
function optAnnSimbadOtypeToCat(ot) {
   switch (ot) {
      case "PN": return "Nebulosas planetarias";
      case "SNR": return "Restos de supernova";
      case "HII": case "EmN": case "RfN": case "GNe": case "SFR": case "HH": case "Cld": case "ISM":
         return "Nebulosas";
      case "DNe": case "MoC": case "glb": return "Nebulosas oscuras";
      case "OpC": return "Cumulos abiertos";
      case "GlC": return "Cumulos globulares";
      case "Cl*": case "As*": return "Estrellas/asterismos";
      case "G": case "GiG": case "GiC": case "GiP": case "IG": case "PaG": case "GrG":
      case "ClG": case "CGG": case "AGN": case "Sy1": case "Sy2": case "SyG": case "rG":
      case "SBG": case "EmG": case "H2G": case "LSB": case "bCG": case "BiC": case "LIN": case "QSO":
         return "Galaxias";
      default: return null;
   }
}
// Lista de otypes que pedimos a SIMBAD (whitelist). Deriva del mapeo de arriba.
var OPT_ANN_SIMBAD_OTYPES = ["PN","SNR","HII","EmN","RfN","GNe","SFR","HH","Cld","ISM",
   "DNe","MoC","glb","OpC","GlC","Cl*","As*","G","GiG","GiC","GiP","IG","PaG","GrG",
   "ClG","CGG","AGN","Sy1","Sy2","SyG","rG","SBG","EmG","H2G","LSB","bCG","BiC","LIN","QSO"];

// Construye la URL de cone-search de SIMBAD TAP (TSV). Filtra por tamaño minimo
// (galdim_majaxis >= minSize arcmin) + whitelist de otype para NO traer miles de
// estrellas/galaxias diminutas. Pura (usa encodeURIComponent, global en V8).
function optAnnBuildSimbadUrl(ra, dec, radiusDeg, opts) {
   opts = opts || {};
   var minSize = opts.minSizeArcmin != null ? opts.minSizeArcmin : 0.5;
   var quoted = [];
   for (var i = 0; i < OPT_ANN_SIMBAD_OTYPES.length; ++i)
      quoted.push("'" + OPT_ANN_SIMBAD_OTYPES[i] + "'");
   var top = opts.maxRows != null ? opts.maxRows : 500;
   var adql = "SELECT TOP " + top + " main_id, ra, dec, galdim_majaxis, galdim_minaxis, galdim_angle, otype " +
      "FROM basic WHERE CONTAINS(POINT('ICRS',ra,dec),CIRCLE('ICRS'," +
      ra.toFixed(6) + "," + dec.toFixed(6) + "," + radiusDeg.toFixed(5) + "))=1 " +
      "AND galdim_majaxis >= " + minSize + " AND otype IN (" + quoted.join(",") + ")";
   var base = opts.host || "http://simbad.cds.unistra.fr";
   return base + "/simbad/sim-tap/sync?request=doQuery&lang=adql&format=tsv&query=" +
      encodeURIComponent(adql);
}
function optAnnUnquote(s) {
   return String(s == null ? "" : s).replace(/^"+|"+$/g, "").replace(/^\s+|\s+$/g, "");
}
// Parsea el TSV de SIMBAD -> registros con el MISMO shape que optAnnParseCatalog
// (name,cat,type,ra,dec,mag,size,minor,posAngle,label). Descarta otype sin mapeo
// y filas sin ra/dec. Pura (string -> array).
function optAnnParseSimbadTsv(text) {
   var out = [];
   if (!text) return out;
   var lines = String(text).split(/\r?\n/);
   var hdr = -1;
   for (var h = 0; h < lines.length; ++h)
      if (/main_id/.test(lines[h]) && /\bra\b/.test(lines[h])) { hdr = h; break; }
   if (hdr < 0) return out;   // no es TSV valido (error de SIMBAD, etc.)
   for (var i = hdr + 1; i < lines.length; ++i) {
      var ln = lines[i]; if (!ln) continue;
      var c = ln.split("\t");
      if (c.length < 7) continue;
      var ra = parseFloat(c[1]), dec = parseFloat(c[2]);
      if (!isFinite(ra) || !isFinite(dec)) continue;
      var ot = optAnnUnquote(c[6]);
      var cat = optAnnSimbadOtypeToCat(ot);
      if (cat === null) continue;
      var maj = parseFloat(c[3]), min = parseFloat(c[4]), pa = parseFloat(c[5]);
      var name = optAnnUnquote(c[0]).replace(/\s+/g, " ");
      out.push({ name: name, cat: cat, type: ot, ra: ra, dec: dec, mag: null,
                 size: isFinite(maj) ? maj : null, minor: isFinite(min) ? min : null,
                 posAngle: isFinite(pa) ? pa : null, label: name });
   }
   return out;
}
// Quita de 'extra' los que caen a <= tolDeg de algun objeto de 'base' (dedup por
// posicion: evita marcar dos veces NGC/IC que SIMBAD tambien devuelve). Pura.
function optAnnDedupByPosition(base, extra, tolDeg) {
   if (!extra || !extra.length) return extra || [];
   if (!base || !base.length) return extra.slice();
   var out = [];
   for (var i = 0; i < extra.length; ++i) {
      var e = extra[i], dup = false;
      for (var j = 0; j < base.length; ++j)
         if (optAnnAngSep(e.ra, e.dec, base[j].ra, base[j].dec) <= tolDeg) { dup = true; break; }
      if (!dup) out.push(e);
   }
   return out;
}

// --- VizieR (HyperLEDA VII/237): galaxias CON diametro. Funciones PURAS ----
// VizieR TAP con format=tsv devuelve el mismo TSV limpio que SIMBAD (cabecera +
// filas). HyperLEDA da logD25 (log10 del diametro D25 en unidades de 0.1') y
// logR25 (log10 del cociente de ejes) -> tamaño y eje menor en arcmin.
function optAnnBuildVizierUrl(ra, dec, radiusDeg, opts) {
   opts = opts || {};
   var top = opts.maxRows != null ? opts.maxRows : 500;
   // Filtro anti-flood por tamaño: d25 >= minSize' <=> logD25 >= 1 + log10(minSize).
   var minSize = opts.minSizeArcmin != null ? opts.minSizeArcmin : 0.5;
   var minLogD25 = 1 + Math.log(minSize) / Math.LN10;
   var adql = "SELECT TOP " + top + " PGC, RAJ2000, DEJ2000, logD25, logR25, PA, ANames " +
      "FROM \"VII/237/pgc\" WHERE 1=CONTAINS(POINT('ICRS',RAJ2000,DEJ2000),CIRCLE('ICRS'," +
      ra.toFixed(6) + "," + dec.toFixed(6) + "," + radiusDeg.toFixed(5) + ")) " +
      "AND logD25 >= " + minLogD25.toFixed(3);
   var base = opts.vizierHost || "http://tapvizier.cds.unistra.fr/TAPVizieR/tap/sync";
   return base + "?request=doQuery&lang=adql&format=tsv&query=" + encodeURIComponent(adql);
}
// Parsea el TSV de VizieR/HyperLEDA -> registros (todas galaxias, cat="Galaxias",
// type="G"). Convierte logD25/logR25 -> size/minor arcmin. Pura.
function optAnnParseVizierTsv(text) {
   var out = [];
   if (!text) return out;
   var lines = String(text).split(/\r?\n/);
   var hdr = -1, col = {};
   for (var h = 0; h < lines.length; ++h)
      if (/RAJ2000/.test(lines[h]) && /DEJ2000/.test(lines[h])) { hdr = h; break; }
   if (hdr < 0) return out;
   var names = lines[hdr].split("\t");
   for (var n = 0; n < names.length; ++n) col[names[n].replace(/^\s+|\s+$/g, "")] = n;
   var iRA = col["RAJ2000"], iDE = col["DEJ2000"], iD = col["logD25"], iR = col["logR25"],
       iPA = col["PA"], iPGC = col["PGC"], iAN = col["ANames"];
   for (var i = hdr + 1; i < lines.length; ++i) {
      var ln = lines[i]; if (!ln || /^#/.test(ln)) continue;
      var c = ln.split("\t");
      var ra = parseFloat(c[iRA]), dec = parseFloat(c[iDE]);
      if (!isFinite(ra) || !isFinite(dec)) continue;
      var logD = parseFloat(c[iD]), logR = (iR != null) ? parseFloat(c[iR]) : NaN;
      var size = isFinite(logD) ? Math.pow(10, logD - 1) : null;           // arcmin (D25)
      var minor = (size != null && isFinite(logR)) ? size / Math.pow(10, logR) : null;
      var pa = (iPA != null) ? parseFloat(c[iPA]) : NaN;
      var an = (iAN != null) ? optAnnUnquote(c[iAN]).split(/[,;|]/)[0].replace(/^\s+|\s+$/g, "") : "";
      var pgc = (iPGC != null) ? optAnnUnquote(c[iPGC]).replace(/^\s+|\s+$/g, "") : "";
      var name = an || (pgc ? ("PGC " + pgc) : "galaxia");
      out.push({ name: name, cat: "Galaxias", type: "G", ra: ra, dec: dec, mag: null,
                 size: size, minor: minor, posAngle: isFinite(pa) ? pa : null, label: name });
   }
   return out;
}

// Selecciona (url, parser) segun la fuente online. SIMBAD por defecto. Pura.
function optAnnOnlineSource(source) {
   if (source === "VizieR")
      return { build: optAnnBuildVizierUrl, parse: optAnnParseVizierTsv };
   return { build: optAnnBuildSimbadUrl, parse: optAnnParseSimbadTsv };
}

// --- Conversion de coordenadas (sexagesimal -> grados). Puras. ------------
function optAnnHmsToDeg(s) {   // "HH:MM:SS.ss" -> grados
   if (!s) return null;
   var p = String(s).split(":");
   if (p.length < 3) return null;
   var h = parseFloat(p[0]), m = parseFloat(p[1]), sec = parseFloat(p[2]);
   if (!(isFinite(h) && isFinite(m) && isFinite(sec))) return null;
   return (h + m / 60 + sec / 3600) * 15;
}
function optAnnDmsToDeg(s) {   // "+DD:MM:SS.s" -> grados
   if (!s) return null;
   s = String(s);
   var sign = s.replace(/^\s+/, "").charAt(0) === "-" ? -1 : 1;
   var p = s.replace(/^\s*[+-]?/, "").split(":");
   if (p.length < 3) return null;
   var d = parseFloat(p[0]), m = parseFloat(p[1]), sec = parseFloat(p[2]);
   if (!(isFinite(d) && isFinite(m) && isFinite(sec))) return null;
   return sign * (d + m / 60 + sec / 3600);
}
// Separacion angular (grados) por haversine. Pura.
function optAnnAngSep(ra1, dec1, ra2, dec2) {
   var R = Math.PI / 180;
   var a = Math.pow(Math.sin((dec2 - dec1) * R / 2), 2) +
           Math.cos(dec1 * R) * Math.cos(dec2 * R) * Math.pow(Math.sin((ra2 - ra1) * R / 2), 2);
   return 2 * Math.asin(Math.min(1, Math.sqrt(a))) / R;
}

// --- Parseo del CSV OpenNGC (;-separado). Puro (string -> array). ---------
// Devuelve [{ name, cat, type, ra, dec, mag, size, label }]. Excluye lo que
// classify() marca como null y las filas sin RA/Dec utilizables.
function optAnnParseCatalog(text) {
   var out = [];
   if (!text) return out;
   var lines = String(text).split(/\r?\n/);
   if (!lines.length) return out;
   var head = lines[0].split(";");
   var ix = {};
   for (var i = 0; i < head.length; ++i) ix[head[i].replace(/^\s+|\s+$/g, "")] = i;
   var iType = ix["Type"], iRA = ix["RA"], iDec = ix["Dec"], iName = ix["Name"];
   var iV = ix["V-Mag"], iB = ix["B-Mag"], iMaj = ix["MajAx"], iMin = ix["MinAx"];
   var iPA = ix["PosAng"], iCommon = ix["Common names"];
   for (var L = 1; L < lines.length; ++L) {
      if (!lines[L]) continue;
      var c = lines[L].split(";");
      var type = (c[iType] || "").replace(/^\s+|\s+$/g, "");
      var cat = optAnnClassify(type);
      if (cat === null) continue;
      var ra = optAnnHmsToDeg(c[iRA]), dec = optAnnDmsToDeg(c[iDec]);
      if (ra === null || dec === null) continue;
      var v = parseFloat(c[iV]), b = parseFloat(c[iB]);
      var mag = isFinite(v) ? v : (isFinite(b) ? b : null);
      var maj = parseFloat(c[iMaj]);                                  // eje mayor (arcmin)
      var min = iMin != null ? parseFloat(c[iMin]) : NaN;             // eje menor (arcmin)
      var pa = iPA != null ? parseFloat(c[iPA]) : NaN;                // angulo de posicion (deg, N->E)
      var name = (c[iName] || "").replace(/^\s+|\s+$/g, "");
      var common = iCommon != null ? (c[iCommon] || "").split(",")[0].replace(/^\s+|\s+$/g, "") : "";
      out.push({ name: name, cat: cat, type: type, ra: ra, dec: dec,
                 mag: mag, size: isFinite(maj) ? maj : null,
                 minor: isFinite(min) ? min : null, posAngle: isFinite(pa) ? pa : null,
                 label: common || name });
   }
   return out;
}

// Rango de magnitud del catalogo (para calibrar el slider). Puro.
function optAnnMagRange(rows) {
   var lo = Infinity, hi = -Infinity;
   for (var i = 0; i < rows.length; ++i) {
      var m = rows[i].mag;
      if (m == null) continue;
      if (m < lo) lo = m;
      if (m > hi) hi = m;
   }
   if (!isFinite(lo)) { lo = 0; hi = 20; }
   return { lo: lo, hi: hi };
}

// Filtra por limite de magnitud (= slider de profundidad). magLimit >= 99 =>
// sin limite (incluye los sin magnitud). Pura.
function optAnnFilterByMagnitude(rows, magLimit) {
   if (magLimit == null || magLimit >= 99) return rows.slice();
   var out = [];
   for (var i = 0; i < rows.length; ++i)
      if (rows[i].mag != null && rows[i].mag <= magLimit) out.push(rows[i]);
   return out;
}

// Filtra por conjunto de categorias activas (objeto {cat:true}). Pura.
function optAnnFilterByCategories(rows, activeSet) {
   if (!activeSet) return rows.slice();
   var out = [];
   for (var i = 0; i < rows.length; ++i)
      if (activeSet[rows[i].cat]) out.push(rows[i]);
   return out;
}

// Declutter greedy: decide QUE objetos llevan etiqueta (todos llevan marker).
// Ordena por prioridad (mas brillante, luego mas grande), coloca la caja de
// texto y salta las que solapan con una ya colocada o superan el tope. Cada
// objeto debe traer px,py (coords de pantalla del preview). Pura salvo `measure`.
// opts = { cap, lineHeight, measure(text)->px, offsetX, offsetY }.
function optAnnDeclutterLabels(objs, opts) {
   opts = opts || {};
   var cap = opts.cap != null ? opts.cap : 60;
   var lineH = opts.lineHeight || 15;
   var offX = opts.offsetX != null ? opts.offsetX : 8;
   var offY = opts.offsetY != null ? opts.offsetY : -15;
   var measure = opts.measure || function (t) { return String(t).length * 7; };
   var sorted = objs.slice().sort(function (a, b) {
      var ma = a.mag == null ? 99 : a.mag, mb = b.mag == null ? 99 : b.mag;
      if (ma !== mb) return ma - mb;
      return (b.size || 0) - (a.size || 0);
   });
   var placed = [], out = [];
   function overlaps(r) {
      for (var i = 0; i < placed.length; ++i) {
         var q = placed[i];
         if (r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1]) return true;
      }
      return false;
   }
   for (var i = 0; i < sorted.length && out.length < cap; ++i) {
      var o = sorted[i];
      var tw = measure(o.label) + 4, th = lineH;
      var lx = o.px + offX, ly = o.py + offY;
      var rect = [lx, ly, lx + tw, ly + th];
      if (overlaps(rect)) continue;
      placed.push(rect);
      o.__labelRect = rect;   // caja para que la UI pinte el fondo/halo
      out.push(o);
   }
   return out;
}

// ==========================================================================
// A partir de aqui: funciones que SI dependen de PixInsight (File, #__FILE__,
// window.imageToCelestial/celestialToImage). No se testean en node.
// ==========================================================================

// Cache del catalogo parseado (una sola lectura por sesion).
var OPT_ANN_CATALOG_CACHE = null;

function optAnnCatalogDir() {
   // #__FILE__ resuelve a la ruta de ESTE fichero incluido (Dev_200/engine/
   // annotations.js), no al script principal. El catalogo esta en Dev_200/
   // catalogs/, un nivel por encima de engine/ -> subimos una carpeta.
   var f = "";
   try { f = String(#__FILE__); } catch (e) { f = ""; }
   var dir = f.replace(/[^\\/]+$/, "");                 // .../Dev_200/engine/
   var parent = dir.replace(/[\\/](engine|ui)[\\/]$/i, "/");  // .../Dev_200/
   return (parent || dir) + "catalogs/";
}

// Lee + parsea catalogs/NGC.csv (+ addendum.csv si existe) y cachea. PJSR.
function optAnnLoadCatalog() {
   if (OPT_ANN_CATALOG_CACHE) return OPT_ANN_CATALOG_CACHE;
   var dir = optAnnCatalogDir(), rows = [];
   try {
      var ngc = dir + "NGC.csv";
      if (File.exists(ngc)) rows = optAnnParseCatalog(File.readTextFile(ngc));
      else console.warningln("Annotations: no encuentro " + ngc);
   } catch (e) { console.warningln("Annotations: error leyendo NGC.csv — " + e); }
   try {
      var add = dir + "addendum.csv";
      if (File.exists(add)) rows = rows.concat(optAnnParseCatalog(File.readTextFile(add)));
   } catch (e2) {}
   try {
      // extra.csv: catálogos que NO están en OpenNGC (planetarios de Abell,
      // nebulosas Sharpless...). Mismo formato ;-separado. Ver README #13 Fase A.
      var ext = dir + "extra.csv";
      if (File.exists(ext)) rows = rows.concat(optAnnParseCatalog(File.readTextFile(ext)));
   } catch (e3) {}
   OPT_ANN_CATALOG_CACHE = rows;
   console.writeln("=> Annotations: catalogo OpenNGC cargado (" + rows.length + " objetos).");
   return rows;
}

// Descarga sincrona de texto por HTTP (patron oficial NetworkTransfer, ver
// scripts/Ephemerides/CoordinateSearchDialog.jsh). Devuelve "" si falla. PJSR.
function optAnnDownloadText(url) {
   try {
      var t = new NetworkTransfer;
      t.setURL(url);
      t.downloadData = new ByteArray;
      t.onDownloadDataAvailable = function (moreData) { this.downloadData.add(moreData); return true; };
      var ok = t.download();
      if (!ok) {
         try { console.warningln("Annotations online: HTTP fallo (code=" + t.responseCode + ")"); } catch (x) {}
         return "";
      }
      return t.downloadData.toString();
   } catch (e) { try { console.warningln("Annotations online: " + e); } catch (x) {} return ""; }
}

// Coloca un registro de catalogo (r con ra/dec/size/minor/posAngle) sobre la
// imagen resuelta: pre-filtro por radio, celestialToImage, y geometria de elipse
// (semieje px + orientacion via norte/este locales). Devuelve el objeto de
// display {..,ix,iy,aPx,bPx,mux,muy,paRad} o null si cae fuera. PJSR.
function optAnnPlaceObject(win, center, margin, r, W, H) {
   if (optAnnAngSep(center.x, center.y, r.ra, r.dec) > margin) return null;   // pre-filtro barato
   var p;
   try { p = win.celestialToImage(new Point(r.ra, r.dec)); } catch (eP) { return null; }
   if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) return null;              // dentro del rectangulo real
   var o = { name: r.name, cat: r.cat, type: r.type, ra: r.ra, dec: r.dec,
             mag: r.mag, size: r.size, label: r.label, ix: p.x, iy: p.y,
             aPx: 0, bPx: 0, paRad: 0, mux: 1, muy: 0 };   // mux,muy = vector unitario del eje mayor (px imagen)
   // Geometria de elipse (como AnnotateImage): semieje mayor px = (MajAx/2) /
   // resolucion; axisRatio = MajAx/MinAx; orientacion = PosAng (N->E) usando el
   // norte/este locales proyectados con celestialToImage. Solo si hay tamaño.
   if (r.size != null && r.size > 0) {
      try {
         var dd = 0.02;                                            // grados
         var cosd = Math.cos(r.dec * Math.PI / 180); if (Math.abs(cosd) < 1e-6) cosd = 1e-6;
         var pN = win.celestialToImage(new Point(r.ra, r.dec + dd));
         var pE = win.celestialToImage(new Point(r.ra + dd / cosd, r.dec));
         var vNx = pN.x - p.x, vNy = pN.y - p.y, vEx = pE.x - p.x, vEy = pE.y - p.y;
         var nN = Math.sqrt(vNx * vNx + vNy * vNy) || 1e-6, nE = Math.sqrt(vEx * vEx + vEy * vEy) || 1e-6;
         var pxPerDeg = nN / dd;
         o.aPx = (r.size / 60 / 2) * pxPerDeg * OPT_ANN_SIZE_FACTOR;   // MajAx arcmin -> semieje px (agrandado)
         var axisRatio = (r.minor != null && r.minor > 0) ? (r.size / r.minor) : 1;
         o.bPx = o.aPx / (axisRatio > 0 ? axisRatio : 1);
         var pa = (r.posAngle != null) ? r.posAngle * Math.PI / 180 : 0;
         var uNx = vNx / nN, uNy = vNy / nN, uEx = vEx / nE, uEy = vEy / nE;
         // Eje mayor = PA medido Norte->Este, en el marco IMAGEN real (uN,uE ya
         // incorporan rotacion de campo y paridad/flip). Vector unitario directo.
         var mjx = Math.cos(pa) * uNx + Math.sin(pa) * uEx;
         var mjy = Math.cos(pa) * uNy + Math.sin(pa) * uEy;
         var mm = Math.sqrt(mjx * mjx + mjy * mjy) || 1;
         o.mux = mjx / mm; o.muy = mjy / mm;
         o.paRad = Math.atan2(mjy, mjx);
      } catch (eG) { o.aPx = 0; o.bPx = 0; o.paRad = 0; }
   }
   return o;
}

// Objetos del catalogo que caen DENTRO de la imagen de una ventana resuelta.
// Devuelve { ok, reason, center:{ra,dec}, fovDeg, objects:[...con px,py...] }.
// px,py = coords de imagen full-res (0..W, 0..H). PJSR (usa la solucion WCS).
function optAnnQueryImage(win, opts) {
   opts = opts || {};
   var res = { ok: false, reason: "", center: null, fovDeg: 0, objects: [] };
   if (!win || win.isNull) { res.reason = "no-window"; return res; }
   var view = win.mainView, W = view.image.width, H = view.image.height;
   var solved = false;
   try { solved = win.hasAstrometricSolution; } catch (e) { solved = false; }
   if (!solved && typeof optHasAstrometricSolution === "function") {
      try { solved = optHasAstrometricSolution(view); } catch (e2) {}
   }
   if (!solved) { res.reason = "no-wcs"; return res; }

   var center = win.imageToCelestial(W / 2, H / 2);
   res.center = { ra: center.x, dec: center.y };
   var corners = [win.imageToCelestial(0, 0), win.imageToCelestial(W, 0),
                  win.imageToCelestial(0, H), win.imageToCelestial(W, H)];
   var radius = 0;
   for (var k = 0; k < 4; ++k)
      radius = Math.max(radius, optAnnAngSep(center.x, center.y, corners[k].x, corners[k].y));
   res.fovDeg = radius * 2;

   var rows = optAnnLoadCatalog();
   var margin = radius * 1.05;
   for (var i = 0; i < rows.length; ++i) {
      var o = optAnnPlaceObject(win, center, margin, rows[i], W, H);
      if (o) res.objects.push(o);
   }
   // Fase B: consulta ONLINE a SIMBAD (opcional). Añade objetos que NO están en
   // el catalogo local (Abell, exoticos...), deduplicados por posicion. Si algo
   // falla (sin red, timeout, TSV invalido) se ignora y quedan los locales.
   res.online = 0;
   if (opts.online) {
      try {
         var src = optAnnOnlineSource(opts.source);
         var url = src.build(center.x, center.y, margin, opts);
         var txt = optAnnDownloadText(url);
         var onl = src.parse(txt);
         var tolDeg = (opts.dedupArcmin != null ? opts.dedupArcmin : 1.0) / 60;
         onl = optAnnDedupByPosition(res.objects, onl, tolDeg);
         for (var oi = 0; oi < onl.length; ++oi) {
            var oo = optAnnPlaceObject(win, center, margin, onl[oi], W, H);
            if (oo) { oo.online = true; res.objects.push(oo); ++res.online; }
         }
      } catch (eOn) { res.onlineError = String(eOn); }
   }
   res.ok = true;
   return res;
}

// --- Estrellas (Fase 2): proceso Gaia on-board por region. --------------------
// Color aproximado a partir de BP-RP (indice de color Gaia): azul (frio negativo)
// -> blanco -> amarillo -> naranja/rojo. Devuelve 0xAARRGGBB. Puro.
function optAnnStarColor(bp, rp) {
   var ci = (isFinite(bp) && isFinite(rp)) ? (bp - rp) : 0.8;   // ~0.8 = estrella G/blanca
   ci = Math.max(-0.4, Math.min(3.2, ci));
   // interpolacion sencilla por tramos sobre un gradiente estelar plausible
   var stops = [[-0.4, 170, 190, 255], [0.4, 255, 255, 255], [1.0, 255, 240, 200],
                [1.8, 255, 200, 140], [3.2, 255, 150, 110]];
   for (var i = 0; i < stops.length - 1; ++i) {
      if (ci <= stops[i + 1][0]) {
         var a = stops[i], b = stops[i + 1];
         var t = (ci - a[0]) / (b[0] - a[0] || 1);
         var r = Math.round(a[1] + t * (b[1] - a[1]));
         var g = Math.round(a[2] + t * (b[2] - a[2]));
         var bl = Math.round(a[3] + t * (b[3] - a[3]));
         return (0xff000000 | (r << 16) | (g << 8) | bl) >>> 0;
      }
   }
   return 0xffffffff;
}

// Estrellas Gaia dentro de la imagen resuelta. magHigh = limite de magnitud
// (= slider de profundidad para estrellas); limit = tope de fuentes (densidad).
// Devuelve { ok, reason, stars:[{ra,dec,ix,iy,mag,color}] }. PJSR (proceso Gaia).
function optAnnQueryStars(win, opts) {
   opts = opts || {};
   var res = { ok: false, reason: "", stars: [] };
   if (!win || win.isNull) { res.reason = "no-window"; return res; }
   if (typeof Gaia === "undefined") { res.reason = "no-gaia"; return res; }
   var view = win.mainView, W = view.image.width, H = view.image.height;
   var solved = false;
   try { solved = win.hasAstrometricSolution; } catch (e) { solved = false; }
   if (!solved) { res.reason = "no-wcs"; return res; }
   var c = win.imageToCelestial(W / 2, H / 2);
   var corners = [win.imageToCelestial(0, 0), win.imageToCelestial(W, 0),
                  win.imageToCelestial(0, H), win.imageToCelestial(W, H)];
   var radius = 0;
   for (var k = 0; k < 4; ++k)
      radius = Math.max(radius, optAnnAngSep(c.x, c.y, corners[k].x, corners[k].y));

   var G = new Gaia;
   G.command = "search";
   G.centerRA = c.x; G.centerDec = c.y; G.radius = radius * 1.05;
   G.magnitudeLow = -5;
   G.magnitudeHigh = (opts.magHigh != null) ? opts.magHigh : 14;
   G.sourceLimit = (opts.limit != null) ? opts.limit : 5000;
   G.requiredFlags = 0; G.inclusionFlags = 0; G.exclusionFlags = 0;
   try { G.generateTextOutput = false; } catch (e0) {}
   try { G.generateBinaryOutput = false; } catch (e1) {}
   try { G.normalizeSpectrum = false; } catch (e2) {}
   try { G.verbosity = 0; } catch (e3) {}
   try { if (!G.executeGlobal()) { res.reason = "gaia-failed"; return res; } }
   catch (e) { res.reason = "gaia-error: " + (e.message || e); return res; }

   var S = G.sources || [];
   for (var i = 0; i < S.length; ++i) {
      var s = S[i];
      var p; try { p = win.celestialToImage(new Point(s[0], s[1])); } catch (eP) { continue; }
      if (p.x < 0 || p.y < 0 || p.x >= W || p.y >= H) continue;
      res.stars.push({ ra: s[0], dec: s[1], ix: p.x, iy: p.y, mag: s[5],
                       color: optAnnStarColor(s[6], s[7]) });
   }
   res.ok = true;
   return res;
}
// ===== ANNOTATIONS-END =====
