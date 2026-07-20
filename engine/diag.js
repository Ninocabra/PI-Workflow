// ===== DIAG-LAYER-BEGIN (F3: centralized error diagnostics + window scope) =====
// A bounded ring buffer of recent failures, so mute catch-blocks can record WHAT
// failed (stage, message, context) instead of vanishing silently. ADDITIVE:
// routing a `catch(e){}` through optDiagError() adds visibility WITHOUT changing
// control flow (the error is still caught/handled exactly as before).
//
// Reversibility: self-contained — remove this file + its #include. Any call sites
// that adopted optDiagError/optWithTempWindow degrade to no-ops only if also reverted;
// each adoption is its own one-line, behaviour-preserving change.

var OPT_DIAG_MAX = 200;          // ring-buffer capacity
var OPT_DIAG_LOG = [];           // [{ t, stage, msg, detail }, ...]

/** Append a diagnostic entry (capped ring buffer) and echo to the console. @returns the entry. */
function optDiagRecord(stage, message, detail) {
   var entry = {
      t: (new Date()).toISOString(),
      stage: String(stage == null ? "" : stage),
      msg: String(message == null ? "" : message),
      detail: (detail == null ? "" : String(detail))
   };
   OPT_DIAG_LOG.push(entry);
   while (OPT_DIAG_LOG.length > OPT_DIAG_MAX) OPT_DIAG_LOG.shift();
   try { console.warningln("[diag] " + entry.stage + ": " + entry.msg + (entry.detail ? (" — " + entry.detail) : "")); } catch (e) {}
   return entry;
}

/** Record a caught exception with its stage + optional context string. @returns the entry. */
function optDiagError(stage, e, context) {
   var msg = (e && e.message) ? e.message : String(e);
   return optDiagRecord(stage, msg, context);
}

/** Empty the diagnostic log. */
function optDiagClear() { OPT_DIAG_LOG = []; }

/** Number of entries currently held. @returns {number} */
function optDiagCount() { return OPT_DIAG_LOG.length; }

/** Human-readable dump of the last `n` entries (most recent last; all if n omitted). @returns {string} */
function optDiagText(n) {
   var k = OPT_DIAG_LOG.length;
   var start = (typeof n === "number" && n > 0) ? Math.max(0, k - n) : 0, out = [];
   for (var i = start; i < k; ++i) {
      var e = OPT_DIAG_LOG[i];
      out.push(e.t + "  [" + e.stage + "] " + e.msg + (e.detail ? (" — " + e.detail) : ""));
   }
   return out.join("\n");
}

/**
 * Scoped temp window: create via `factory`, run `fn(win)`, and ALWAYS close the
 * window afterwards — even if `fn` throws. Use for short-lived helper windows so a
 * thrown exception cannot leak an orphan. Cleanup failures are logged, not rethrown.
 * @param {function():ImageWindow} factory @param {function(ImageWindow):*} fn @returns whatever `fn` returns.
 */
function optWithTempWindow(factory, fn) {
   var win = factory();
   try {
      return fn(win);
   } finally {
      try { if (win && !win.isNull) win.forceClose(); }
      catch (e) { optDiagError("temp-window-close", e, ""); }
   }
}

/**
 * Leak sentinel for GUI flows the headless harness cannot cover (Compare,
 * CabraMagic, ...). Scans the open image windows for transient/working views that
 * `stage` should have closed: any window whose id starts with one of `prefixes`
 * (e.g. "Opt_Compare_", "Opt_CC_") is flagged via optDiagRecord. Log-only — it never
 * closes anything or changes control flow, so it is safe to call anywhere. Unlike the
 * harness window_leak check it counts by name, not total, so intended survivors
 * (memory-slot results, the committed output) are not false-positives.
 * @param {string} stage @param {string[]} prefixes @returns {number} leak count.
 */
function optDiagScanTempLeaks(stage, prefixes) {
   var pfx = (prefixes && prefixes.length) ? prefixes : ["Opt_Compare_", "Opt_CC_", "Opt_Gray"];
   var leaked = [];
   try {
      var wins = ImageWindow.windows;
      for (var i = 0; i < wins.length; ++i) {
         var id = "";
         try { id = wins[i].mainView.id; } catch (e0) { continue; }
         for (var j = 0; j < pfx.length; ++j)
            if (id.indexOf(pfx[j]) === 0) { leaked.push(id); break; }
      }
   } catch (eScan) {
      optDiagError(stage + " leak-scan", eScan, "");
      return 0;
   }
   if (leaked.length > 0)
      optDiagRecord(stage, "left " + leaked.length + " transient window(s) open", leaked.join(", "));
   return leaked.length;
}
// ===== DIAG-LAYER-END =====
