// ann_engine_test.js — test NODE de las funciones PURAS de engine/annotations.js
// (feature #13, Fase 1). Uso: node _tests/ann_engine_test.js
// Carga el fuente del motor (reemplazando el token PJSR #__FILE__), extrae las
// funciones puras y las valida contra el catalogo real catalogs/NGC.csv.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
let src = fs.readFileSync(path.join(ROOT, "engine", "annotations.js"), "utf8")
            .replace(/#__FILE__/g, '""');   // token de preprocesador PJSR -> string

// Evalua el motor en un scope aislado y exporta las funciones puras.
const S = {};
new Function("S", src + "\n;Object.assign(S,{optAnnClassify,optAnnHmsToDeg,optAnnDmsToDeg," +
   "optAnnAngSep,optAnnParseCatalog,optAnnMagRange,optAnnFilterByMagnitude," +
   "optAnnFilterByCategories,optAnnDeclutterLabels,OPT_ANN_CATEGORIES,OPT_ANN_CATCOLOR," +
   "optAnnSubtypeActive,OPT_ANN_SUBTYPES,OPT_ANN_TYPELABEL," +
   "optAnnSimbadOtypeToCat,optAnnBuildSimbadUrl,optAnnParseSimbadTsv,optAnnDedupByPosition,OPT_ANN_SIMBAD_OTYPES," +
   "optAnnBuildVizierUrl,optAnnParseVizierTsv,optAnnOnlineSource," +
   "OPT_ANN_CAT_EN,OPT_ANN_TYPELABEL_EN,optAnnCatLabelEN,optAnnTypeLabelEN});")(S);

let pass = 0, fail = 0;
function ok(name, cond) { if (cond) { ++pass; } else { ++fail; console.log("  FAIL: " + name); } }
function approx(a, b, tol) { return Math.abs(a - b) <= tol; }

// --- clasificacion ---------------------------------------------------------
ok("classify G",        S.optAnnClassify("G") === "Galaxias");
ok("classify GPair",    S.optAnnClassify("GPair") === "Galaxias");
ok("classify PN",       S.optAnnClassify("PN") === "Nebulosas planetarias");
ok("classify OCl",      S.optAnnClassify("OCl") === "Cumulos abiertos");
ok("classify GCl",      S.optAnnClassify("GCl") === "Cumulos globulares");
ok("classify SNR",      S.optAnnClassify("SNR") === "Restos de supernova");
ok("classify Dup->null",  S.optAnnClassify("Dup") === null);
ok("classify NonEx->null", S.optAnnClassify("NonEx") === null);
ok("classify unknown->Otros", S.optAnnClassify("ZZZ") === "Otros");
ok("cada categoria tiene color", S.OPT_ANN_CATEGORIES.every(c => typeof S.OPT_ANN_CATCOLOR[c] === "number"));

// --- coordenadas -----------------------------------------------------------
ok("hms 06:00:00 = 90deg", approx(S.optAnnHmsToDeg("06:00:00"), 90, 1e-6));
ok("dms +27:43:03.6",      approx(S.optAnnDmsToDeg("+27:43:03.6"), 27.717666, 1e-4));
ok("dms negativo -05:23:00", approx(S.optAnnDmsToDeg("-05:23:00"), -5.383333, 1e-4));
ok("angSep mismo punto = 0", approx(S.optAnnAngSep(10, 20, 10, 20), 0, 1e-9));
ok("angSep 1deg en dec",     approx(S.optAnnAngSep(0, 0, 0, 1), 1, 1e-6));
ok("angSep 1deg en RA (ecuador)", approx(S.optAnnAngSep(0, 0, 1, 0), 1, 1e-6));

// --- parseo del catalogo real ---------------------------------------------
const ngc = fs.readFileSync(path.join(ROOT, "catalogs", "NGC.csv"), "utf8");
const rows = S.optAnnParseCatalog(ngc);
ok("parse: mas de 12000 objetos", rows.length > 12000);
ok("parse: cada fila tiene ra/dec numericos", rows.slice(0, 500).every(r => isFinite(r.ra) && isFinite(r.dec)));
ok("parse: sin categoria null", rows.every(r => r.cat !== null));
const ngc1560 = rows.find(r => r.name === "NGC1560");
ok("parse: NGC1560 presente y es Galaxia", !!ngc1560 && ngc1560.cat === "Galaxias");
const cats = {};
rows.forEach(r => cats[r.cat] = (cats[r.cat] || 0) + 1);
ok("parse: Galaxias es la categoria mayor", cats["Galaxias"] > 9000);

const mr = S.optAnnMagRange(rows);
ok("magRange coherente", mr.lo < mr.hi && mr.lo > -5 && mr.hi < 30);

// --- filtros ---------------------------------------------------------------
const synth = [
   { cat: "Galaxias", mag: 8,   size: 5, label: "A" },
   { cat: "Galaxias", mag: 12,  size: 2, label: "B" },
   { cat: "Nebulosas", mag: null, size: 30, label: "C" },
   { cat: "Cumulos abiertos", mag: 6, size: 10, label: "D" }
];
ok("filtro mag<=10 deja 2", S.optAnnFilterByMagnitude(synth, 10).length === 2);
ok("filtro mag 99 deja todos", S.optAnnFilterByMagnitude(synth, 99).length === 4);
ok("filtro categoria Galaxias deja 2", S.optAnnFilterByCategories(synth, { "Galaxias": true }).length === 2);

// --- declutter: sin solapes + respeta el cap ------------------------------
const objs = [];
for (let i = 0; i < 200; ++i)
   objs.push({ label: "OBJ" + i, mag: (i % 20), size: 1, px: (i % 20) * 3, py: Math.floor(i / 20) * 4 });
const labeled = S.optAnnDeclutterLabels(objs, { cap: 30, measure: t => t.length * 7 });
ok("declutter respeta el cap", labeled.length <= 30);
ok("declutter prioriza brillantes (incluye mag 0)", labeled.some(o => o.mag === 0));
let overlapFound = false;
for (let i = 0; i < labeled.length; ++i)
   for (let j = i + 1; j < labeled.length; ++j) {
      const a = labeled[i].__labelRect, b = labeled[j].__labelRect;
      if (a[0] < b[2] && a[2] > b[0] && a[1] < b[3] && a[3] > b[1]) overlapFound = true;
   }
ok("declutter: etiquetas sin solapes", !overlapFound);

// --- subtipos por categoria ------------------------------------------------
ok("subtipos: cada codigo Type de las categorias multi mapea de vuelta",
   Object.keys(S.OPT_ANN_SUBTYPES).every(cat =>
      S.OPT_ANN_SUBTYPES[cat].every(ty => S.optAnnClassify(ty) === cat)));
ok("subtipos: Galaxias tiene G/GPair/GTrpl/GGroup",
   S.OPT_ANN_SUBTYPES["Galaxias"].join(",") === "G,GPair,GTrpl,GGroup");
ok("subtipos: cada Type listado tiene nombre legible",
   Object.keys(S.OPT_ANN_SUBTYPES).every(cat =>
      S.OPT_ANN_SUBTYPES[cat].every(ty => typeof S.OPT_ANN_TYPELABEL[ty] === "string")));
// filtro de subtipos (subActive = { cat: { type: bool } })
const oG  = { cat: "Galaxias", type: "G" };
const oGP = { cat: "Galaxias", type: "GPair" };
const oPN = { cat: "Nebulosas planetarias", type: "PN" };
ok("subActive null -> muestra todo", S.optAnnSubtypeActive(oG, null) === true);
ok("subActive sin la categoria -> muestra", S.optAnnSubtypeActive(oG, {}) === true);
ok("subActive con G=false oculta G", S.optAnnSubtypeActive(oG, { "Galaxias": { "G": false, "GPair": true } }) === false);
ok("subActive con G=false NO oculta GPair", S.optAnnSubtypeActive(oGP, { "Galaxias": { "G": false, "GPair": true } }) === true);
ok("subActive type no listado (undefined) -> muestra", S.optAnnSubtypeActive(oPN, { "Nebulosas planetarias": {} }) === true);

// --- catalogo extra (Abell PNe + Sharpless, no estan en OpenNGC) -----------
const extraPath = path.join(ROOT, "catalogs", "extra.csv");
if (fs.existsSync(extraPath)) {
   const ex = S.optAnnParseCatalog(fs.readFileSync(extraPath, "utf8"));
   ok("extra: mas de 350 objetos", ex.length > 350);
   const a39 = ex.find(r => r.name === "Abell 39");
   ok("extra: Abell 39 presente", !!a39);
   ok("extra: Abell 39 es Nebulosa planetaria", !!a39 && a39.cat === "Nebulosas planetarias" && a39.type === "PN");
   ok("extra: Abell 39 coords ~246.89/+27.91", !!a39 && approx(a39.ra, 246.890, 1e-2) && approx(a39.dec, 27.909, 1e-2));
   ok("extra: Abell 39 tamaño ~2.9 arcmin", !!a39 && approx(a39.size, 2.9, 0.1));
   ok("extra: Sharpless presentes (Sh2-155)", ex.some(r => r.name === "Sh2-155" && r.cat === "Nebulosas"));
} else {
   console.log("  (extra.csv no encontrado — saltando tests de catálogo extra)");
}

// --- Fase B: consulta online (funciones PURAS) -----------------------------
ok("otype PN -> Nebulosas planetarias", S.optAnnSimbadOtypeToCat("PN") === "Nebulosas planetarias");
ok("otype GiG -> Galaxias", S.optAnnSimbadOtypeToCat("GiG") === "Galaxias");
ok("otype Sy2 -> Galaxias", S.optAnnSimbadOtypeToCat("Sy2") === "Galaxias");
ok("otype GlC -> Cumulos globulares", S.optAnnSimbadOtypeToCat("GlC") === "Cumulos globulares");
ok("otype DNe -> Nebulosas oscuras", S.optAnnSimbadOtypeToCat("DNe") === "Nebulosas oscuras");
ok("otype desconocido -> null (se descarta)", S.optAnnSimbadOtypeToCat("Star") === null);
ok("whitelist coherente con el mapeo", S.OPT_ANN_SIMBAD_OTYPES.every(ot => S.optAnnSimbadOtypeToCat(ot) !== null));

const url = S.optAnnBuildSimbadUrl(246.89, 27.91, 0.5, {});
ok("url SIMBAD tiene sim-tap + tsv", /sim-tap\/sync/.test(url) && /format=tsv/.test(url));
ok("url SIMBAD encodea el CIRCLE con las coords", /246\.89/.test(decodeURIComponent(url)) && /CONTAINS/.test(decodeURIComponent(url)));
ok("url SIMBAD filtra por galdim + otype", /galdim_majaxis\s*>=/.test(decodeURIComponent(url)) && /otype IN/.test(decodeURIComponent(url)));

// TSV como el que devuelve SIMBAD (header + filas reales del campo de Abell 39)
const tsv = [
   "main_id\tra\tdec\tgaldim_majaxis\tgaldim_minaxis\tgaldim_angle\totype",
   '"PN A66   39"\t246.8905\t27.9093\t2.9\t2.9\t90\t"PN"',
   '"NGC  1560"\t68.20\t71.88\t9.55\t1.68\t21\t"GiG"',
   '"SDSS Jxxx"\t246.9\t27.9\t0.03\t0.03\t0\t"Star"'   // otype Star -> descartado
].join("\n");
const parsed = S.optAnnParseSimbadTsv(tsv);
ok("parseSimbadTsv: descarta otype no mapeado (Star)", parsed.length === 2);
const pnObj = parsed.find(o => /A66/.test(o.name));
ok("parseSimbadTsv: Abell 39 -> PN/Nebulosas planetarias", !!pnObj && pnObj.cat === "Nebulosas planetarias" && pnObj.type === "PN");
ok("parseSimbadTsv: coords y size numericos", !!pnObj && approx(pnObj.ra, 246.8905, 1e-3) && approx(pnObj.size, 2.9, 1e-6));
ok("parseSimbadTsv: TSV invalido -> []", S.optAnnParseSimbadTsv("<html>error</html>").length === 0);

// dedup por posicion: NGC1560 online coincide con un local -> se quita
const localFov = [{ name: "NGC1560", cat: "Galaxias", ra: 68.20, dec: 71.88 }];
const dd = S.optAnnDedupByPosition(localFov, parsed, 1.0 / 60);
ok("dedup: quita el duplicado (NGC1560) y deja Abell 39", dd.length === 1 && /A66/.test(dd[0].name));
ok("dedup: sin base devuelve todos", S.optAnnDedupByPosition([], parsed, 1.0 / 60).length === parsed.length);

// --- VizieR / HyperLEDA (funciones PURAS) ----------------------------------
const vurl = S.optAnnBuildVizierUrl(68.20, 71.88, 0.33, {});
ok("url VizieR: TAP + tsv", /TAPVizieR\/tap\/sync/.test(vurl) && /format=tsv/.test(vurl));
ok("url VizieR: HyperLEDA + cone + filtro logD25", /VII%2F237%2Fpgc|VII\/237\/pgc/.test(decodeURIComponent(vurl)) && /CONTAINS/.test(decodeURIComponent(vurl)) && /logD25\s*>=/.test(decodeURIComponent(vurl)));
// TSV como el de VizieR TAP (cabecera + fila que reproduce NGC1560: D25=8.3'x1.68', PA 21)
// logD25 = log10(9.55*10)=1.98 -> size 9.55'; logR25 = log10(9.55/1.70)=0.75 -> minor 1.70'
const vtsv = [
   "PGC\tRAJ2000\tDEJ2000\tlogD25\tlogR25\tPA\tANames",
   "15488\t68.2001\t71.8806\t1.980\t0.750\t21\tNGC1560"
].join("\n");
const vp = S.optAnnParseVizierTsv(vtsv);
ok("VizieR parse: 1 galaxia", vp.length === 1 && vp[0].cat === "Galaxias" && vp[0].type === "G");
ok("VizieR parse: nombre = ANames (NGC1560)", vp[0].name === "NGC1560");
ok("VizieR parse: logD25 1.98 -> size ~9.55'", approx(vp[0].size, 9.55, 0.1));
ok("VizieR parse: logR25 0.75 -> minor ~1.70'", approx(vp[0].minor, 1.70, 0.05));
ok("VizieR parse: PA 21", vp[0].posAngle === 21);
ok("VizieR parse: TSV invalido -> []", S.optAnnParseVizierTsv("<html>503</html>").length === 0);
// dispatcher de fuente
ok("onlineSource VizieR -> parser VizieR", S.optAnnOnlineSource("VizieR").parse === S.optAnnParseVizierTsv);
ok("onlineSource default -> SIMBAD", S.optAnnOnlineSource().parse === S.optAnnParseSimbadTsv);

// --- i18n de display (build 24): mapas EN + cobertura en OPT_I18N_ES --------
ok("cada categoria tiene label EN", S.OPT_ANN_CATEGORIES.every(c => typeof S.OPT_ANN_CAT_EN[c] === "string"));
ok("optAnnCatLabelEN(Galaxias) = Galaxies", S.optAnnCatLabelEN("Galaxias") === "Galaxies");
ok("cada subtipo tiene label EN", Object.keys(S.OPT_ANN_SUBTYPES).every(cat =>
   S.OPT_ANN_SUBTYPES[cat].every(ty => typeof S.OPT_ANN_TYPELABEL_EN[ty] === "string")));
ok("optAnnTypeLabelEN(PN) = Planetary nebula", S.optAnnTypeLabelEN("PN") === "Planetary nebula");
// Cargar OPT_I18N_ES del fichero de recursos real y comprobar que traduce todo.
try {
   const rsrc = fs.readFileSync(path.join(ROOT, "PI Workflow_resources.jsh"), "utf8").replace(/^#.*$/gm, "");
   const RES = {};
   new Function("RES", rsrc + "\n;try{RES.ES=OPT_I18N_ES}catch(e){RES.ES={}}")(RES);
   const es = RES.ES || {};
   const need = [];
   S.OPT_ANN_CATEGORIES.forEach(c => need.push(S.OPT_ANN_CAT_EN[c]));
   Object.keys(S.OPT_ANN_SUBTYPES).forEach(cat => S.OPT_ANN_SUBTYPES[cat].forEach(ty => need.push(S.OPT_ANN_TYPELABEL_EN[ty])));
   ["Depth: all", "Depth: mag ≤", "Analyze", "Sky map (Aladin)", "Back to annotations",
    "Save annotated image", "Search online surveys:", "DSO objects", "Real star colour (BP-RP)"].forEach(s => need.push(s));
   const missing = need.filter(en => !es[en]);
   if (missing.length) console.log("  i18n ES faltan: " + missing.join(" | "));
   ok("OPT_I18N_ES traduce todas las categorias/subtipos/controles de Anotaciones", missing.length === 0);
} catch (e) { console.log("  (no pude cargar OPT_I18N_ES para el test: " + e + ")"); ok("OPT_I18N_ES cargable", false); }

// --- resumen ---------------------------------------------------------------
console.log("\nCatalogo: " + rows.length + " objetos. Por categoria:");
Object.keys(cats).sort((a, b) => cats[b] - cats[a]).forEach(c =>
   console.log("  " + c.padEnd(24) + cats[c]));
console.log("\n" + (fail === 0 ? "RESULT: GREEN" : "RESULT: RED") + "  (" + pass + " pass, " + fail + " fail)");
process.exit(fail === 0 ? 0 : 1);
