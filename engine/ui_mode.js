// ===== UI-MODE-BEGIN (F6: Simple / Advanced two-speed UI) =====
// A global view mode. "Advanced" = the full manual workflow (current UI, default).
// "Simple" hides the advanced tabs and the advanced Pre-processing sections, leaving
// image selection, crop and the one-click CabraMagic auto-process. The mode persists
// across sessions. The actual show/hide is done by PIWorkflowOptDialog.applyUiMode.
//
// Reversibility: master flag below + delimited UI blocks. Set the flag false (or
// remove this file + its #include) and the toggle disappears; everything stays visible.

/** @const Master flag — false removes the Simple/Advanced toggle (UI is always Advanced). */
var OPT_UI_MODE_ENABLED = false;
var OPT_UI_MODE_KEY = "PIWorkflow/uiMode";

/** Read the persisted view mode. Defaults to "advanced" so existing users see no change. */
function optUiModeRead() {
   var v = null;
   try { v = Settings.read(OPT_UI_MODE_KEY, DataType_String); } catch (e) {}
   return (v === "simple") ? "simple" : "advanced";
}

/** Persist the view mode ("simple" | "advanced"). */
function optUiModeWrite(mode) {
   try { Settings.write(OPT_UI_MODE_KEY, DataType_String, (mode === "simple") ? "simple" : "advanced"); } catch (e) {}
}
// ===== UI-MODE-END =====
