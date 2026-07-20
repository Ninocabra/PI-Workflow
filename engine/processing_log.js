// ===== PROC-LOG-BEGIN (community feature: exportable processing log) =====
// Builds a human-readable processing log for the active workflow image and a
// best-effort AstroBin acquisition CSV, from two sources that already exist:
//   1. store.record(key).stages — every stage the workflow marked on the image
//      (insertion order preserved: JS string keys keep insert order).
//   2. The view's FITS keywords — acquisition data (OBJECT/TELESCOP/EXPTIME/...)
//      plus HISTORY lines written by WBPP / ImageIntegration (numberOfImages,
//      rejection, WBPP version), which survive stacking into the master.
// The log can be embedded into the image itself (HISTORY keywords — portable to
// both FITS and XISF — plus an XISF view property "PIWorkflow:ProcessingLog") and
// saved as a .txt for forum/AstroBin descriptions. AstroBin CSV import format per
// https://welcome.astrobin.com/importing-acquisitions-from-csv : header line,
// columns date,number,duration,binning,gain,sensorCooling (number+duration are
// the mandatory pair; `filter` needs AstroBin's numeric equipment id, which we
// cannot know locally, so it is intentionally omitted).
// There is no separate "Log" button: the log rides along with the export flows.
//   - Export (to workspace): optProcLogEmbed() into the exported view.
//   - Export TIF / Export As (to disk): optProcLogEmbedInstance() into the written
//     file + optProcLogWriteSidecars() for the .txt/.csv next to it.
// Reversibility: delete this file + its #include and the optProcLog* calls in the
// export flows (ui/panels.js exportCurrent/exportCurrentTiff, engine/export.js,
// ui/dialog_chrome.js Export As handler).

var OPT_PROCLOG_ACQ_KEYS = [
   "OBJECT", "TELESCOP", "INSTRUME", "FILTER", "EXPTIME", "EXPOSURE",
   "XBINNING", "YBINNING", "GAIN", "EGAIN", "OFFSET", "SET-TEMP", "CCD-TEMP",
   "DATE-OBS", "DATE-END", "FOCALLEN", "APTDIA", "SITELAT", "SITELONG",
   "OBSERVER", "SWCREATE", "NAXIS1", "NAXIS2"
];

// Read the view's FITS keywords into { acq: {NAME: value}, history: [line, ...] }.
function optProcLogKeywords(view) {
   var out = { acq: {}, history: [] };
   try {
      var kws = view.window.keywords;
      for (var i = 0; i < kws.length; ++i) {
         var k = kws[i], name = String(k.name || "").toUpperCase();
         if (name === "HISTORY" || name === "COMMENT") {
            var line = String(k.comment || k.value || "").replace(/^\s+|\s+$/g, "");
            if (line) out.history.push(line);
            continue;
         }
         for (var j = 0; j < OPT_PROCLOG_ACQ_KEYS.length; ++j) {
            if (name === OPT_PROCLOG_ACQ_KEYS[j]) {
               var v = String(k.value == null ? "" : k.value).replace(/^'+|'+$/g, "").replace(/^\s+|\s+$/g, "");
               if (v && !optHasOwn(out.acq, name)) out.acq[name] = v;
               break;
            }
         }
      }
   } catch (e0) {}
   return out;
}

// Best-effort parse of WBPP / ImageIntegration HISTORY lines from a master.
function optProcLogIntegrationInfo(historyLines) {
   var info = { numberOfImages: 0, rejection: "", wbpp: "", drizzle: "", lines: [] };
   for (var i = 0; i < historyLines.length; ++i) {
      var L = historyLines[i];
      var m = L.match(/ImageIntegration\.numberOfImages\s*[:=]\s*(\d+)/i);
      if (m) info.numberOfImages = parseInt(m[1], 10);
      m = L.match(/ImageIntegration\.pixelRejection\s*[:=]\s*(\S+)/i);
      if (m) info.rejection = m[1];
      m = L.match(/WeightedBatchPreprocessing\s*v?([\d.]+)/i) || L.match(/WBPP\s*v?([\d.]+)/i);
      if (m) info.wbpp = m[1];
      if (/drizzle/i.test(L)) info.drizzle = "yes";
      // Keep a compact subset of interesting lines for the log body.
      if (/ImageIntegration|WBPP|WeightedBatch|Drizzle|LocalNormalization/i.test(L) && info.lines.length < 12)
         info.lines.push(L);
   }
   return info;
}

// Collects everything into one plain data object. `record` is the workflow store
// record for the image (may be null for views processed outside the store).
function optProcLogCollect(view, record) {
   var kw = optProcLogKeywords(view);
   var stages = [];
   try {
      if (record && record.stages)
         for (var s in record.stages)
            if (optHasOwn(record.stages, s) && record.stages[s] === true) stages.push(s);
   } catch (e0) {}
   var d = new Date();
   return {
      generated: d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2) + "-" + ("0" + d.getDate()).slice(-2),
      version: (typeof OPT_VERSION !== "undefined") ? OPT_VERSION : "",
      imageId: view.id,
      width: view.image.width, height: view.image.height,
      isColor: view.image.numberOfChannels >= 3,
      acq: kw.acq,
      integration: optProcLogIntegrationInfo(kw.history),
      stages: stages
   };
}

// Human-readable log (plain text / Markdown-friendly) for descriptions and forums.
function optProcLogText(data) {
   var L = [];
   L.push("PROCESSING LOG — " + (data.acq.OBJECT || data.imageId));
   L.push("Generated " + data.generated + " by PI Workflow " + data.version);
   L.push("");
   L.push("## Image");
   L.push("- View: " + data.imageId + " (" + data.width + "x" + data.height + ", " + (data.isColor ? "RGB" : "mono") + ")");
   var acqOrder = ["OBJECT", "TELESCOP", "INSTRUME", "FILTER", "DATE-OBS", "EXPTIME", "XBINNING", "GAIN", "EGAIN", "OFFSET", "CCD-TEMP", "FOCALLEN", "OBSERVER"];
   var acqAny = false;
   for (var i = 0; i < acqOrder.length; ++i) if (optHasOwn(data.acq, acqOrder[i])) { acqAny = true; break; }
   if (acqAny) {
      L.push("");
      L.push("## Acquisition (from FITS header)");
      for (var a = 0; a < acqOrder.length; ++a)
         if (optHasOwn(data.acq, acqOrder[a])) L.push("- " + acqOrder[a] + ": " + data.acq[acqOrder[a]]);
   }
   var ii = data.integration;
   if (ii && (ii.numberOfImages > 0 || ii.wbpp || ii.lines.length > 0)) {
      L.push("");
      L.push("## Stacking / WBPP");
      if (ii.wbpp) L.push("- WBPP version: " + ii.wbpp);
      if (ii.numberOfImages > 0) L.push("- Integrated frames: " + ii.numberOfImages);
      if (ii.rejection) L.push("- Pixel rejection: " + ii.rejection);
      if (ii.drizzle) L.push("- Drizzle: " + ii.drizzle);
   }
   L.push("");
   L.push("## Processing steps (PI Workflow)");
   if (data.stages.length === 0)
      L.push("- (no workflow stages recorded on this image yet)");
   for (var s = 0; s < data.stages.length; ++s)
      L.push((s + 1) + ". " + data.stages[s]);
   L.push("");
   L.push("—");
   L.push("Log generated automatically by PI Workflow (CabraSpace).");
   return L.join("\n");
}

// AstroBin acquisition CSV (best effort). Returns { csv, notes[] }. `number` and
// `duration` are mandatory on AstroBin's side; when we cannot derive them the CSV
// is still produced with blanks so the user only fills the gaps.
function optProcLogAstroBinCsv(data) {
   var notes = [];
   var date = "";
   if (data.acq["DATE-OBS"]) {
      var md = String(data.acq["DATE-OBS"]).match(/(\d{4}-\d{2}-\d{2})/);
      if (md) date = md[1];
   }
   var number = data.integration && data.integration.numberOfImages > 0 ? String(data.integration.numberOfImages) : "";
   if (!number) notes.push("frame count not found in HISTORY (fill `number`)");
   var duration = "";
   var exp = parseFloat(data.acq.EXPTIME || data.acq.EXPOSURE || "");
   if (isFinite(exp) && exp > 0) {
      duration = String(exp);
      // Masters sometimes carry TOTAL integration in EXPTIME; flag the suspicion
      // instead of guessing (per-sub durations above 30 min are rare).
      if (exp > 1800 && data.integration.numberOfImages > 1)
         notes.push("EXPTIME=" + exp + "s looks like TOTAL integration, not per-frame — check `duration`");
   } else notes.push("per-frame exposure not found (fill `duration`)");
   var binning = data.acq.XBINNING || "";
   var gain = data.acq.GAIN || "";
   var cooling = data.acq["SET-TEMP"] || data.acq["CCD-TEMP"] || "";
   if (cooling) { var ci = parseFloat(cooling); cooling = isFinite(ci) ? String(Math.round(ci)) : ""; }
   var csv = "date,number,duration,binning,gain,sensorCooling\n" +
             [date, number, duration, binning, gain, cooling].join(",") + "\n";
   notes.push("`filter` requires AstroBin's numeric equipment id — add it manually if desired");
   return { csv: csv, notes: notes };
}

// Build the HISTORY FITSKeyword "cards" that carry the log text, chunked to stay
// within FITS card limits (68 chars/card, "PIW|" prefixed). Shared by the in-view
// embed (optProcLogEmbed) and the disk-file embed (optProcLogEmbedInstance) so both
// persist byte-identical content.
function optProcLogKeywordCards(text) {
   var cards = [];
   try {
      cards.push(new FITSKeyword("HISTORY", "", "PIWorkflow processing log (see PIWorkflow:ProcessingLog property)"));
      var lines = String(text == null ? "" : text).split("\n");
      for (var i = 0; i < lines.length; ++i) {
         var ln = lines[i].replace(/\s+$/, "");
         if (!ln) continue;
         for (var off = 0; off < ln.length; off += 68)
            cards.push(new FITSKeyword("HISTORY", "", "PIW| " + ln.substring(off, off + 68)));
      }
   } catch (e) {}
   return cards;
}

// Embed the log into the image: HISTORY keywords (FITS+XISF portable) and an XISF
// view property. Used for the workspace "Export" (the view stays in PixInsight).
function optProcLogEmbed(view, text) {
   var okKw = false, okProp = false;
   try {
      var win = view.window;
      var kws = win.keywords;
      var cards = optProcLogKeywordCards(text);
      for (var i = 0; i < cards.length; ++i) kws.push(cards[i]);
      win.keywords = kws;
      okKw = true;
   } catch (eK) { try { if (typeof optDiagError === "function") optDiagError("proclog-embed-keywords", eK, ""); } catch (e0) {} }
   try {
      view.setPropertyValue("PIWorkflow:ProcessingLog", text);
      okProp = true;
   } catch (eP) { try { if (typeof optDiagError === "function") optDiagError("proclog-embed-property", eP, ""); } catch (e1) {} }
   return { keywords: okKw, property: okProp };
}

// Embed the log into a FileFormatInstance about to write a disk file, by appending
// the HISTORY log cards to whatever keywords the instance already carries. Call
// after create(), before writeImage(). Best-effort: only formats that can store
// keywords (TIFF/FITS/XISF) persist them; PNG/JPEG silently keep just the pixels
// (the sidecar .txt covers those). Returns true if the cards were attached.
function optProcLogEmbedInstance(fInst, format, text) {
   try {
      if (!fInst || !format || !format.canStoreKeywords) return false;
      var existing = [];
      try { existing = fInst.keywords || []; } catch (e0) { existing = []; }
      fInst.keywords = existing.concat(optProcLogKeywordCards(text));
      return true;
   } catch (e) {
      try { if (typeof optDiagError === "function") optDiagError("proclog-embed-instance", e, ""); } catch (e1) {}
      return false;
   }
}

// One-shot: collect the log data and render its text for a view. `record` is the
// workflow store record (may be null). Returns { data, text } or null if the view
// is not usable. Callers pass `text` to the embed helpers and { data, text } to the
// sidecar writer.
function optProcLogBuild(view, record) {
   if (!optSafeView(view)) return null;
   var data = optProcLogCollect(view, record);
   return { data: data, text: optProcLogText(data) };
}

// Write the description .txt and AstroBin _astrobin.csv next to an exported image
// file (disk exports only). `imagePath` is the exported image's full path (any
// extension); the sidecars replace the extension with .txt and _astrobin.csv.
// Best-effort; returns { txtPath, csvPath, notes[] } with "" paths on failure.
function optProcLogWriteSidecars(imagePath, data, text) {
   var out = { txtPath: "", csvPath: "", notes: [] };
   try {
      var base = String(imagePath).replace(/\.[A-Za-z0-9]+$/, "");
      var txtPath = base + ".txt";
      File.writeTextFile(txtPath, text);
      out.txtPath = txtPath;
      var ab = optProcLogAstroBinCsv(data);
      var csvPath = base + "_astrobin.csv";
      File.writeTextFile(csvPath, ab.csv);
      out.csvPath = csvPath;
      out.notes = ab.notes;
   } catch (e) {
      try { if (typeof optDiagError === "function") optDiagError("proclog-sidecars", e, String(imagePath)); } catch (e0) {}
   }
   return out;
}
// ===== PROC-LOG-END =====
