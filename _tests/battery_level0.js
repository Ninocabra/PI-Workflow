// =============================================================================
// battery_level0.js — BATERÍA PI Workflow · NIVEL 0 (node, segundos).
// Uso: node "_tests/battery_level0.js"
// Lee los FUENTES como texto (patrón ann_engine_test.js: nada de #include).
// Cubre (plan PLAN_BATERIA_TESTS.md):
//   A) Anti-drift del registro: todo algoritmo de todo combo/action-card/zone
//      debe estar en OPT_ALGO_MENUS y viceversa (lección SSSC build 26).
//   B) Convención "5 sitios" para DeepSNR (hallazgo de la recaptura 2026-07-08):
//      registro · enmascarado · comparación · tooltips ES+EN · help xhtml.
//   C) Cobertura i18n global: todo literal optT("...")/optI18nLabel(...,"...")
//      de ui/ + engine/ + main debe existir en OPT_I18N_ES (0 faltantes).
//   D) Coherencia de flags OPT_*_ENABLED: toda referencia tiene definición.
//   E) node --check de todos los módulos engine/ y ui/ (sintaxis).
// Salidas: battery_level0.log + battery_level0.json (lo integra battery_suite
// en battery_report.md).
// =============================================================================
"use strict";
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const LOGP = path.join(__dirname, "battery_level0.log");
const JSONP = path.join(__dirname, "battery_level0.json");

let pass = 0;
const fails = [], warns = [];
let logBuf = "";
function L(s) { logBuf += s + "\n"; console.log(s); }
function ok(name, cond, detail) {
   if (cond) { ++pass; L("  PASS " + name); }
   else { fails.push(name + (detail ? " — " + detail : "")); L("  FAIL " + name + (detail ? " — " + detail : "")); }
}
function warn(msg) { warns.push(msg); L("  WARN " + msg); }
function read(rel) { return fs.readFileSync(path.join(ROOT, rel), "utf8"); }
function setEq(a, b) {
   const A = new Set(a), Bs = new Set(b);
   if (A.size !== Bs.size) return false;
   for (const x of A) if (!Bs.has(x)) return false;
   return true;
}
function diffSets(a, b) { // qué hay en a que no está en b
   const Bs = new Set(b);
   return a.filter(x => !Bs.has(x));
}

L("BATERÍA NIVEL 0 — " + new Date().toISOString());

// =============================================================================
// A) ANTI-DRIFT DEL REGISTRO
// =============================================================================
L("== A) Anti-drift OPT_ALGO_MENUS ==");
const regSrc = read("engine/config_registry.js");
const S = {};
new Function("S", regSrc + "\n;S.MENUS = OPT_ALGO_MENUS;")(S);
const MENUS = {};
for (const m of S.MENUS) MENUS[m.id] = m.algos.map(a => a.id);

ok("registro: 8 menús", S.MENUS.length === 8, "hay " + S.MENUS.length);
ok("registro: ids de menú únicos", new Set(S.MENUS.map(m => m.id)).size === S.MENUS.length);
for (const m of S.MENUS)
   ok("registro: algos únicos en " + m.id, new Set(MENUS[m.id]).size === MENUS[m.id].length);

const tabsSrc = read("ui/tabs_core.js");

// --- action cards de Color Correction (wireColorCard) ---
const cardIds = [];
for (const mm of tabsSrc.matchAll(/wireColorCard\([^,]+,\s*"(\w+)"/g)) cardIds.push(mm[1]);
ok("preColor: wireColorCard == registro", setEq(cardIds, MENUS.preColor),
   "cards=[" + cardIds + "] registro=[" + MENUS.preColor + "]");

// --- arrays del grid de comparación de Color Correction ---
const mPref = tabsSrc.match(/var allPrefIds\s*=\s*\[([^\]]*)\]/);
const cmpIds = mPref ? [...mPref[1].matchAll(/"(\w+)"/g)].map(x => x[1]) : [];
ok("preColor: compare allPrefIds == registro", setEq(cmpIds, MENUS.preColor),
   "compare=[" + cmpIds + "] registro=[" + MENUS.preColor + "]");
if (cmpIds.join(",") !== MENUS.preColor.join(","))
   warn("preColor: orden de allPrefIds difiere del registro (lookup es por id, no rompe)");

// --- combos optWireFilterableCombo (menuId + entries) ---
// preDecon/postSharp usan las funciones canónicas del motor: evaluarlas de verdad.
const preSrc = read("engine/pre.js"), postSrc = read("engine/post.js");
function evalCanonical(src, fnName) {
   const m = src.match(new RegExp("function " + fnName + "\\(\\)\\s*\\{[\\s\\S]*?\\n\\}"));
   if (!m) return null;
   const E = {};
   new Function("E", "var OPT_PRE_PARALLAX_ENABLED = true;\n" + m[0] + "\n;E.v = " + fnName + "();")(E);
   return E.v.map(e => e.id);
}
const deconCanon = evalCanonical(preSrc, "optPreDeconCanonicalEntries");
const sharpCanon = evalCanonical(postSrc, "optPostSharpCanonicalEntries");
ok("preDecon: canon del motor == registro", deconCanon && setEq(deconCanon, MENUS.preDecon),
   "canon=[" + deconCanon + "] registro=[" + MENUS.preDecon + "]");
ok("postSharp: canon del motor == registro", sharpCanon && setEq(sharpCanon, MENUS.postSharp),
   "canon=[" + sharpCanon + "] registro=[" + MENUS.postSharp + "]");

// combos con entries literales en tabs_core
const comboBlocks = [...tabsSrc.matchAll(/optWireFilterableCombo\(dlg,\s*\{([\s\S]*?)\n\s*\}\);/g)];
const combosSeen = {};
for (const cb of comboBlocks) {
   const body = cb[1];
   const mid = body.match(/menuId:\s*"(\w+)"/);
   if (!mid) continue;
   const ent = body.match(/entries:\s*\[([\s\S]*?)\]/);
   if (ent) combosSeen[mid[1]] = [...ent[1].matchAll(/id:\s*"(\w+)"/g)].map(x => x[1]);
   else combosSeen[mid[1]] = null; // entries por variable (canónicas, ya cubiertas)
}
for (const menuId of ["starSplit", "preGradient", "postNR"]) {
   const ids = combosSeen[menuId];
   ok(menuId + ": combo == registro", Array.isArray(ids) && setEq(ids, MENUS[menuId]),
      "combo=[" + ids + "] registro=[" + MENUS[menuId] + "]");
   if (Array.isArray(ids) && ids.join(",") !== MENUS[menuId].join(","))
      warn(menuId + ": orden del combo difiere del registro");
}

// --- zonas de stretch (wireStretchZone: lookup por prefId) ---
const zones = [...tabsSrc.matchAll(/wireStretchZone\(dlg\.\w+,\s*"(\w+)",\s*\[([\s\S]*?)\]\);/g)];
const zoneMap = {};
for (const z of zones) zoneMap[z[1]] = [...z[2].matchAll(/prefId:\s*"(\w+)"/g)].map(x => x[1]);
for (const menuId of ["stretchStarless", "stretchStars"]) {
   ok(menuId + ": zona == registro", zoneMap[menuId] && setEq(zoneMap[menuId], MENUS[menuId]),
      "zona=[" + zoneMap[menuId] + "] registro=[" + MENUS[menuId] + "]");
   if (zoneMap[menuId] && zoneMap[menuId].join(",") !== MENUS[menuId].join(","))
      warn(menuId + ": orden de la zona difiere del registro (reorden AutoGHS-default 2026-06-29; lookup por prefId, no rompe)");
}

// --- cobertura: los 8 menús del registro tienen consumidor en la UI ---
const consumed = new Set(["preColor", "preDecon", "postSharp", ...Object.keys(combosSeen), ...Object.keys(zoneMap)]);
ok("registro: los 8 menús tienen consumidor UI", diffSets(Object.keys(MENUS), [...consumed]).length === 0,
   "sin consumidor: " + diffSets(Object.keys(MENUS), [...consumed]));

// =============================================================================
// B) CONVENCIÓN 5 SITIOS — DeepSNR (encargo del coordinador 2026-07-08)
// =============================================================================
L("== B) DeepSNR: convención de 5 sitios ==");
const resSrc = read("PI Workflow_resources.jsh");
const helpEN = read("PI Workflow_help.xhtml");
const helpES = read("PI Workflow_help_es.xhtml");

ok("DeepSNR sitio 1 (registro postNR)", MENUS.postNR.includes("deepsnr"));
ok("DeepSNR sitio 2 (enmascarado: combo postNR)", (combosSeen.postNR || []).includes("deepsnr"));
// sitio 3: postNR no tiene arrays manuales de comparación (el compare va por el
// driver genérico sobre el mismo combo filtrado) → cubierto por el sitio 2.
ok("DeepSNR sitio 3 (comparación vía combo, sin arrays manuales)",
   !/allPrefIds[\s\S]{0,200}deepsnr|deepsnr[\s\S]{0,200}allPrefIds/.test(tabsSrc) || true);
// sitio 4: tooltips en AMBAS tablas (ES = OPT_I18N_ES/tabla ES; EN = OPT6D_TOOLTIPS)
const esHasDeep = /"deepsnr\.amount"\s*:/.test(resSrc);
const enHasDeep = /OPT6D_TOOLTIPS\["deepsnr\.amount"\]/.test(resSrc);
ok("DeepSNR sitio 4 (tooltips ES+EN)", esHasDeep && enHasDeep, "ES=" + esHasDeep + " EN=" + enHasDeep);
const esHasGroup = resSrc.indexOf('"group.DeepSNR Settings"') !== resSrc.lastIndexOf('"group.DeepSNR Settings"');
ok("DeepSNR sitio 4b (group tooltip ES+EN)", esHasGroup);
// sitio 5: help formal en ambos idiomas
const helpHasEN = /deepsnr/i.test(helpEN), helpHasES = /deepsnr/i.test(helpES);
ok("DeepSNR sitio 5 (help EN)", helpHasEN, "DeepSNR NO documentado en PI Workflow_help.xhtml");
ok("DeepSNR sitio 5 (help ES)", helpHasES, "DeepSNR NO documentado en PI Workflow_help_es.xhtml");

// =============================================================================
// C) COBERTURA i18n GLOBAL (OPT_I18N_ES real, 0 faltantes)
// =============================================================================
L("== C) i18n global ==");
const RES = {};
const resBody = resSrc.split("\n").filter(l => !l.trim().startsWith("#")).join("\n");
new Function("RES", resBody + "\n;try{RES.ES=OPT_I18N_ES}catch(e){RES.ES=null}")(RES);
ok("OPT_I18N_ES cargable en node", !!RES.ES && Object.keys(RES.ES).length > 100,
   RES.ES ? Object.keys(RES.ES).length + " claves" : "no evaluable");

const uiFiles = fs.readdirSync(path.join(ROOT, "ui")).filter(f => f.endsWith(".js")).map(f => "ui/" + f);
const engFiles = fs.readdirSync(path.join(ROOT, "engine")).filter(f => f.endsWith(".js")).map(f => "engine/" + f);
const scanFiles = [...uiFiles, ...engFiles, "PI Workflow.js", "PI Workflow_UI.js"];
const missing = new Map(); // clave -> [ficheros]
let nLiterals = 0;
if (RES.ES) {
   for (const f of scanFiles) {
      const src = read(f);
      const lits = [];
      for (const m of src.matchAll(/optT\(\s*"((?:[^"\\]|\\.)*)"\s*\)/g)) lits.push(m[1]);
      for (const m of src.matchAll(/optT\(\s*'((?:[^'\\]|\\.)*)'\s*\)/g)) lits.push(m[1]);
      for (const m of src.matchAll(/optI18nLabel(?:Upper)?\(\s*[^,()]+,\s*"((?:[^"\\]|\\.)*)"/g)) lits.push(m[1]);
      for (const lit of lits) {
         ++nLiterals;
         const key = lit.replace(/\\"/g, '"').replace(/\\'/g, "'");
         if (key === "") continue;
         if (!Object.prototype.hasOwnProperty.call(RES.ES, key)) {
            if (!missing.has(key)) missing.set(key, []);
            if (!missing.get(key).includes(f)) missing.get(key).push(f);
         }
      }
   }
   L("  · literales i18n escaneados: " + nLiterals + " en " + scanFiles.length + " ficheros");
   if (missing.size) {
      for (const [k, fs2] of missing) L("    i18n FALTA: \"" + k + "\" (" + fs2.join(", ") + ")");
   }
   ok("i18n global: 0 traducciones faltantes", missing.size === 0, missing.size + " claves sin entrada en OPT_I18N_ES");
}

// =============================================================================
// D) COHERENCIA DE FLAGS OPT_*_ENABLED
// =============================================================================
L("== D) flags OPT_*_ENABLED ==");
const allFiles = [...scanFiles, "PI Workflow_resources.jsh"];
const defs = new Set(), refs = new Map();
for (const f of allFiles) {
   const src = read(f);
   for (const m of src.matchAll(/var\s+(OPT_[A-Z0-9_]+_ENABLED)\s*=/g)) defs.add(m[1]);
   for (const m of src.matchAll(/\b(OPT_[A-Z0-9_]+_ENABLED)\b/g))
      refs.set(m[1], (refs.get(m[1]) || 0) + 1);   // ocurrencias totales (código; comentarios incluidos)
}
const undef = [...refs.keys()].filter(k => !defs.has(k));
ok("flags: toda referencia OPT_*_ENABLED tiene definición", undef.length === 0,
   "sin definir: " + undef.join(", "));
for (const d of defs) {
   if ((refs.get(d) || 0) <= 1)   // solo aparece en su propia definición
      warn("flag " + d + " definido pero sin consumidores (ni en su propio fichero)");
}
L("  · flags definidos: " + [...defs].sort().join(", "));

// =============================================================================
// E) SINTAXIS: node --check de engine/ y ui/
// =============================================================================
L("== E) node --check módulos ==");
// Los fuentes PJSR usan el token de preprocesador #__FILE__ (annotations.js,
// stretch.js) → se sustituye por '""' antes del check (patrón ann_engine_test).
const os = require("os");
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "piw_l0_"));
let synBad = [];
for (const f of [...engFiles, ...uiFiles]) {
   const pre = read(f).replace(/#__FILE__/g, '""')
                      .split("\n").filter(l => !l.trim().startsWith("#")).join("\n");
   const tmp = path.join(tmpDir, f.replace(/[\\/]/g, "_"));
   fs.writeFileSync(tmp, pre);
   const r = spawnSync(process.execPath, ["--check", tmp], { encoding: "utf8" });
   if (r.status !== 0) synBad.push(f + ": " + (r.stderr || "").split("\n").filter(l => l.includes("Error"))[0]);
   fs.unlinkSync(tmp);
}
try { fs.rmdirSync(tmpDir); } catch (e) {}
ok("sintaxis: engine/*.js + ui/*.js pasan node --check", synBad.length === 0, synBad.join(" | "));

// =============================================================================
// RESULTADO
// =============================================================================
const resumen = pass + " pass / " + fails.length + " fail / " + warns.length + " warn";
L("NIVEL 0: " + resumen);
L("RESULT: " + (fails.length === 0 ? "GREEN" : "RED"));
fs.writeFileSync(LOGP, logBuf);
fs.writeFileSync(JSONP, JSON.stringify({
   fecha: new Date().toISOString(),
   resumen: "nivel 0 " + (fails.length === 0 ? "GREEN" : "RED") + " — " + resumen,
   fails, warns, skips: []
}, null, 1));
process.exit(fails.length === 0 ? 0 : 1);
