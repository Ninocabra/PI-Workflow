// ===== SESSION-PERSISTENCE-BEGIN (F4: workflow presets) =====
// Serialises a workflow setup to/from a named JSON file, so it can be saved,
// shared and restored as a named preset. Two layers:
//   v1  algorithm enable/disable registry (Configuration tab, OPT_ALGO_ENABLED).
//   v2  per-tool parameters: the serializable state objects of the tools that
//       keep one (Color Mixer, Detail) — see OPT_SESSION_PARAM_TOOLS. Captured
//       only when a live dialog is passed; absent in headless / file-only use.
//
// Reversibility: this whole block is self-contained — remove the file + its
// #include and the two Configuration-tab buttons to roll back with no other edits.

/** @const Schema version of the on-disk preset format (2 = added the `params` section). */
var OPT_SESSION_SCHEMA = 2;

/** Deep clone of a JSON-safe value (drops functions / breaks aliasing). @param {*} o @returns {*} */
function optSessionClone(o) { return (o == null) ? null : JSON.parse(JSON.stringify(o)); }

// Registry of tools whose serializable state participates in presets. Each entry:
//   key      stable id stored under state.params (never rename without a migration).
//   get(dlg) -> the tool's live state object, or null if the tool isn't built.
//   set(dlg, v) -> restore the snapshot into the live state AND refresh its widgets,
//                  reusing the dialog's existing reload hooks. Defensive throughout:
//                  a tool that isn't present on this dialog is silently skipped.
// New stateful tools are added here only; capture/apply below stay generic.
var OPT_SESSION_PARAM_TOOLS = [
   { key: "colorMixer",
     get: function(dlg) { return (dlg && dlg.colorMixerState) ? dlg.colorMixerState : null; },
     set: function(dlg, v) {
        if (!dlg || !v) return;
        dlg.colorMixerState = v;
        try { if (dlg.reloadColorMixerBands) dlg.reloadColorMixerBands(); } catch (e0) {}
        try { if (dlg.ncColorMixerStrength) dlg.ncColorMixerStrength.setValue(v.globalStrength); } catch (e1) {}
        try { if (dlg.ncColorMixerSelectivity && isFinite(v.selectivity)) dlg.ncColorMixerSelectivity.setValue(v.selectivity); } catch (e2) {}
     } },
   { key: "detail",
     get: function(dlg) { return (dlg && dlg.detailState) ? dlg.detailState : null; },
     set: function(dlg, v) {
        if (!dlg || !v) return;
        dlg.detailState = v;
        try { if (dlg.reloadDetailPanels) dlg.reloadDetailPanels(); } catch (e0) {}
     } }
];

/**
 * Snapshot a workflow setup into a plain, JSON-safe object.
 * The algorithm registry is always captured (read-only). When `dlg` is given, each
 * stateful tool in OPT_SESSION_PARAM_TOOLS contributes a cloned snapshot under `params`.
 * @param {Object} [dlg] - the live PIWorkflowOptDialog (optional; omit for registry-only).
 * @returns {{schema:number, app:string, savedAt:string, algos:Object, params:Object}}
 */
function optSessionCapture(dlg) {
   var algos = {};
   for (var i = 0; i < OPT_ALGO_MENUS.length; ++i) {
      var menu = OPT_ALGO_MENUS[i], rec = {};
      for (var j = 0; j < menu.algos.length; ++j) {
         var id = menu.algos[j].id;
         rec[id] = optIsAlgoEnabled(menu.id, id) === true;
      }
      algos[menu.id] = rec;
   }
   var params = {};
   if (dlg) {
      for (var t = 0; t < OPT_SESSION_PARAM_TOOLS.length; ++t) {
         var tool = OPT_SESSION_PARAM_TOOLS[t];
         try { var snap = tool.get(dlg); if (snap != null) params[tool.key] = optSessionClone(snap); } catch (e) {}
      }
   }
   return { schema: OPT_SESSION_SCHEMA, app: "PI Workflow", savedAt: (new Date()).toISOString(), algos: algos, params: params };
}

/**
 * Apply a captured snapshot. The algorithm registry is restored (and persisted via
 * Settings). When `dlg` is given, per-tool `params` are restored into the live state
 * and the tool widgets refreshed. Unknown ids are skipped (forward/backward compatible).
 * @param {Object} state - object from optSessionCapture / optSessionFromJson.
 * @param {Object} [dlg] - the live dialog (optional; omit to apply registry only).
 * @returns {{applied:number, skipped:number, paramsApplied:number}}
 */
function optSessionApply(state, dlg) {
   var applied = 0, skipped = 0, paramsApplied = 0;
   if (!state || !state.algos) return { applied: applied, skipped: skipped, paramsApplied: paramsApplied };
   for (var i = 0; i < OPT_ALGO_MENUS.length; ++i) {
      var menu = OPT_ALGO_MENUS[i], rec = state.algos[menu.id];
      for (var j = 0; j < menu.algos.length; ++j) {
         var id = menu.algos[j].id;
         var v = rec ? rec[id] : undefined;
         if (v === true || v === false) { optSetAlgoEnabled(menu.id, id, v); ++applied; }
         else ++skipped;
      }
   }
   if (dlg && state.params) {
      for (var t = 0; t < OPT_SESSION_PARAM_TOOLS.length; ++t) {
         var tool = OPT_SESSION_PARAM_TOOLS[t];
         var pv = state.params[tool.key];
         if (pv != null) { try { tool.set(dlg, optSessionClone(pv)); ++paramsApplied; } catch (e) {} }
      }
   }
   return { applied: applied, skipped: skipped, paramsApplied: paramsApplied };
}

/** Serialise a session object to pretty JSON text. @param {Object} state @returns {string} */
function optSessionToJson(state) { return JSON.stringify(state, null, 2); }

/**
 * Parse + validate session JSON text. Throws on malformed JSON or a non-PI-Workflow file.
 * @param {string} text @returns {Object} the parsed session object.
 */
function optSessionFromJson(text) {
   var s = JSON.parse(text);
   if (!s || s.app !== "PI Workflow" || !s.algos)
      throw new Error("Not a PI Workflow preset file.");
   return s;
}

/**
 * Capture the current setup and write it to `path` as JSON.
 * @param {string} path @param {Object} [dlg] - live dialog (captures per-tool params too).
 * @returns {Object} the captured state.
 */
function optSessionSaveToFile(path, dlg) {
   var state = optSessionCapture(dlg);
   File.writeTextFile(path, optSessionToJson(state));
   return state;
}

/**
 * Read a preset from `path`, validate it and apply it.
 * @param {string} path @param {Object} [dlg] - live dialog (restores per-tool params too).
 * @returns {{applied:number, skipped:number, paramsApplied:number}}
 */
function optSessionLoadFromFile(path, dlg) {
   if (!File.exists(path)) throw new Error("Preset file not found: " + path);
   var state = optSessionFromJson(File.readTextFile(path));
   return optSessionApply(state, dlg);
}
// ===== SESSION-PERSISTENCE-END =====
