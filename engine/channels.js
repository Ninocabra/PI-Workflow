function optCreateRgbFromChannels(viewR, viewG, viewB, baseId, metadataView) {
   if (!optSafeView(viewR) || !optSafeView(viewG) || !optSafeView(viewB))
      throw new Error("R, G and B channels are required.");
   optRequireSameGeometry("RGB channel combination", [viewR, viewG, viewB]);
   var win = null;
   var inProcess = false;
   try {
      win = optCreateWindowLike(viewG, baseId || "Opt_RGB", 3, true);
      win.mainView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      var pm = new PixelMath();
      pm.useSingleExpression = false;
      pm.expression = viewR.id;
      pm.expression1 = viewG.id;
      pm.expression2 = viewB.id;
      pm.executeOn(win.mainView);
      win.mainView.endProcess();
      inProcess = false;
      optCopyMetadata(win, metadataView || viewG);
      try { win.hide(); } catch (eHide) {}
      return win.mainView;
   } catch (e) {
      if (inProcess && win && !win.isNull) {
         try { win.mainView.endProcess(); } catch (eEnd) {}
      }
      if (win && !win.isNull) {
         try { win.forceClose(); } catch (eClose) {}
      }
      throw e;
   }
}

function optApplyLuminanceLRGB(rgbView, luminanceView) {
   optRequireSameGeometry("LRGB luminance application", [rgbView, luminanceView]);
   var lrgb = new LRGBCombination();
   lrgb.channels = [
      [true,  luminanceView.id, 1.0],
      [false, "", 1.0],
      [false, "", 1.0],
      [false, "", 1.0]
   ];
   lrgb.mL = 1.0;
   lrgb.mC = 1.0;
   lrgb.clipping = true;
   lrgb.noiseReduction = false;
   lrgb.layersCount = 5;
   var inProcess = false;
   try {
      rgbView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      lrgb.executeOn(rgbView);
      rgbView.endProcess();
      inProcess = false;
   } catch (e) {
      if (inProcess) {
         try { rgbView.endProcess(); } catch (eEnd) {}
      }
      throw e;
   }
}

// =========================================================================
// LRGB-WEIGHT-BEGIN — Added 2026-05-18
// Feature: user-adjustable L blending weight (0%–200%) for R+G+B+L combine.
// UI: inline slider revealed by right-clicking the "L:" label, only when an
// L image is selected (auto-hides when L is set to None).
// To revert this feature, remove every block tagged // LRGB-WEIGHT-BEGIN ...
// // LRGB-WEIGHT-END throughout the file, plus the single-line marker:
//   - `this.luminanceWeight = 1.0;`  in PIWorkflowOptDialog constructor.
// Locations:
//   1. This helper block (LRGB-WEIGHT-BEGIN … LRGB-WEIGHT-END below).
//   2. Inline slider row block inside `buildMonoGroup` (~line 5996).
//   3. Two blocks inside `combineMono` (~line 6924) — RGB backup + post-blend.
//   4. Single line `this.luminanceWeight = 1.0;` in dialog constructor.
// =========================================================================
function optGetLuminanceWeight(dialog) {
   if (!dialog) return 1.0;
   var w = dialog.luminanceWeight;
   if (typeof w !== "number" || !isFinite(w)) return 1.0;
   if (w < 0.0) return 0.0;
   if (w > 2.0) return 2.0;
   return w;
}

function optLrgbWeightBlend(lrgbView, rgbBackupView, weight) {
   // PixelMath: $T = lrgb * w + rgb * (1 - w), clipped to [0,1].
   // weight = 1.0 → pure LRGB (no change). weight = 0.0 → pure RGB (no L).
   // weight > 1.0 extrapolates: amplifies L's effect beyond standard LRGB.
   var pm = new PixelMath();
   pm.expression = "$T*" + weight + " + " + rgbBackupView.id + "*(1-" + weight + ")";
   pm.useSingleExpression = true;
   pm.createNewImage = false;
   pm.rescale = false;
   pm.truncate = true;
   pm.truncateLower = 0.0;
   pm.truncateUpper = 1.0;
   var inProcess = false;
   try {
      lrgbView.beginProcess(UndoFlag_NoSwapFile);
      inProcess = true;
      pm.executeOn(lrgbView);
      lrgbView.endProcess();
      inProcess = false;
   } catch (e) {
      if (inProcess) try { lrgbView.endProcess(); } catch (eEnd) {}
      throw e;
   }
}

// =========================================================================
// LRGB-WEIGHT-END
// =========================================================================

function optRecipeChannels(recipe) {
   var r = (recipe || "SHO").toUpperCase();
   if (r === "HOO") return ["H", "O", "O"];
   if (r === "HSO") return ["H", "S", "O"];
   if (r === "HOS") return ["H", "O", "S"];
   if (r === "OSS") return ["O", "S", "S"];
   if (r === "OHH") return ["O", "H", "H"];
   if (r === "OSH") return ["O", "S", "H"];
   if (r === "OHS") return ["O", "H", "S"];
   if (r === "HSS") return ["H", "S", "S"];
   if (r === "REAL1") return ["H", "O", "S"];
   if (r === "REAL2") return ["O", "H", "S"];
   if (r === "FORAXX") return ["H", "O", "O"];
   return ["S", "H", "O"];
}

// =========================================================================
// DBXTRACT-BEGIN — Added 2026-05-18
// Invokes the external DBXtract.js script to extract Ha / OIII / SII from
// two dual-band RGB filter images (HO = Ha+OIII, SO = SII+OIII).
// Sensor=0 (no specific OSC sensor model), rgbCustomize=false (default
// extraction matrix). Returns the three extracted mono views by their
// canonical DBXtract IDs (_HA, _OIII, _SII). Throws if any output is missing.
// To revert: delete this block AND the DBXTRACT branch inside combineNb().
// =========================================================================
function optRunDBXtract(hoView, soView) {
   if (!optSafeView(hoView) || !optSafeView(soView))
      throw new Error("DBXtract requires both HO and OS source views.");
   // Script path. $PXI_SRCDIR resolves at preprocess time only, not at runtime,
   // so we hard-code the conventional install path.
   var dbxPath = "C:/Program Files/PixInsight/src/scripts/DBXtract/DBXtract.js";
   if (!File.exists(dbxPath))
      throw new Error("DBXtract.js not found at: " + dbxPath +
         "\nVerify the script is installed under PixInsight's src/scripts/DBXtract/.");
   // Populate the global Parameters object that DBXtract reads via Parameters.get*.
   Parameters.set("referenceHO",  hoView.id);
   Parameters.set("referenceSO",  soView.id);
   Parameters.set("sensor",       0);
   Parameters.set("rgbCustomize", false);
   Parameters.set("integracion",  0);
   Parameters.set("r1", 0.04); Parameters.set("r2", 0.8);
   Parameters.set("r3", 0.74); Parameters.set("r4", 0.04);
   Parameters.set("g1", 0.93); Parameters.set("g2", 0.11);
   Parameters.set("g3", 0.13); Parameters.set("g4", 0.67);
   Parameters.set("b1", 0.5);  Parameters.set("b2", 0.04);
   Parameters.set("b3", 0.05); Parameters.set("b4", 0.7);
   // Read DBXtract source and strip PJSR preprocessor directives so eval() can parse it:
   //   #include  → no-op comment       (we already #include the same .jsh files at top of this script)
   //   #feature-*→ no-op comment       (script-registration metadata, irrelevant at runtime)
   //   #define K V → var K = V;        (preprocessor macros become real JS constants)
   var code = File.readFile(dbxPath).toString();
   code = code.replace(/^[ \t]*#include[^\n\r]*$/gm,                "// stripped #include");
   code = code.replace(/^[ \t]*#feature-[^\n\r]*$/gm,                "// stripped #feature");
   code = code.replace(/^[ \t]*#define\s+(\w+)\s+(.+?)\s*$/gm,       "var $1 = $2;");
   // Newer DBXtract.js added a bare #engine directive (older versions only carried
   // #include/#feature/#define, all handled above). eval() parses any remaining "#word"
   // line as a JS private field ("Private field '#engine' must be declared in an enclosing
   // class"), so strip EVERY leftover preprocessor line (#engine, #target, …) to a no-op.
   // A catch-all is simpler and future-proof vs. enumerating directive names; the three
   // replacements above already turned #include/#feature/#define into non-'#' lines.
   code = code.replace(/^[ \t]*#[^\n\r]*$/gm,                        "// stripped directive");
   try {
      // eval runs in this function's scope; DBXtract's globals (data, scriptMain, main, etc.)
      // become locals here and are GC'd when this function returns. main() at the bottom
      // of DBXtract reads Parameters → sees referenceHO/SO set → runs DBXtractStart(data)
      // directly without showing any dialog.
      eval(code);
   } catch (eEval) {
      throw new Error("DBXtract eval failed: " + (eEval && eEval.message ? eEval.message : eEval));
   }
   var ha   = View.viewById("_HA");
   var oiii = View.viewById("_OIII");
   var sii  = View.viewById("_SII");
   if (!optSafeView(ha) || !optSafeView(oiii) || !optSafeView(sii))
      throw new Error("DBXtract did not produce the expected output views (_HA / _OIII / _SII).");
   return { ha: ha, oiii: oiii, sii: sii };
}

// Closes every view DBXtract leaves in the workspace. Safe to call when only
// some of them exist (partial run after an error). Hard-coded against the
// view IDs declared in DBXtract.js (R_NAME, G_NAME, ..., SII_SH_NAME).
function optCloseDBXtractIntermediates() {
   var names = [
      "_R", "_G", "_B",                     // extracted RGB primary channels
      "_HA", "_OIII", "_SII", "_HB",        // extracted narrowband emission lines
      "OIII_HO", "OIII_SO", "SII_SO", "SII_SH"  // dual-band intermediate composites
   ];
   for (var i = 0; i < names.length; ++i) {
      try {
         var v = View.viewById(names[i]);
         if (optSafeView(v))
            optCloseView(v);
      } catch (eClose) {}
   }
}
// =========================================================================
// DBXTRACT-END
// =========================================================================


var OPT_NB_LINE_DB = {
   H: { id: "H", name: "H-alpha", shortName: "Ha", wavelength: 656.28, bandwidth: 7.0 },
   O: { id: "O", name: "OIII", shortName: "OIII", wavelength: 500.70, bandwidth: 7.0 },
   S: { id: "S", name: "SII", shortName: "SII", wavelength: 672.40, bandwidth: 7.0 }
};

function optNarrowbandLine(id) {
   var k = String(id || "").toUpperCase().charAt(0);
   if (k === "H" || k === "O" || k === "S")
      return OPT_NB_LINE_DB[k];
   return null;
}

function optIsNarrowbandRecipeName(text) {
   var r = String(text || "").toUpperCase();
   if (r === "SHO" || r === "HOO" || r === "HSO" || r === "HOS" || r === "OSS" ||
       r === "OHH" || r === "OSH" || r === "OHS" || r === "HSS" ||
       r === "REAL1" || r === "REAL2" || r === "FORAXX")
      return true;
   return false;
}

function optReadWorkflowKeyword(view, keywordName) {
   if (!optSafeView(view))
      return "";
   var wanted = String(keywordName || "").toUpperCase();
   try {
      var kw = view.window.keywords;
      for (var i = 0; i < kw.length; ++i) {
         var name = String(kw[i].name || "").toUpperCase();
         if (name === wanted) {
            var v = kw[i].strippedValue;
            if (typeof v === "undefined")
               v = kw[i].value;
            try { return String(v || "").replace(/^'|'$/g, "").replace(/^\s+|\s+$/g, ""); } catch (e0) { return ""; }
         }
      }
   } catch (e1) {}
   return "";
}

function optSetWorkflowKeyword(view, keywordName, value, comment) {
   if (!optSafeView(view))
      return false;
   try {
      if (typeof FITSKeyword === "undefined")
         return false;
      var wanted = String(keywordName || "").toUpperCase();
      var kwOld = [];
      try { kwOld = view.window.keywords; } catch (e0) { kwOld = []; }
      var kwNew = [];
      for (var i = 0; i < kwOld.length; ++i) {
         var name = String(kwOld[i].name || "").toUpperCase();
         if (name !== wanted)
            kwNew.push(kwOld[i]);
      }
      kwNew.push(new FITSKeyword(wanted, String(value || ""), String(comment || "")));
      view.window.keywords = kwNew;
      return true;
   } catch (e1) {}
   return false;
}

function optSetWorkflowProperty(view, propertyId, value) {
   if (!optSafeView(view))
      return false;
   try {
      if (typeof view.setPropertyValue === "function") {
         view.setPropertyValue(propertyId, value);
         return true;
      }
   } catch (e0) {}
   try {
      if (view.window && view.window.mainView && typeof view.window.mainView.setPropertyValue === "function") {
         view.window.mainView.setPropertyValue(propertyId, value);
         return true;
      }
   } catch (e1) {}
   return false;
}

function optAnnotateNarrowbandView(view, recipe, originText) {
   if (!optSafeView(view) || !optIsNarrowbandRecipeName(recipe))
      return;
   var channels = optRecipeChannels(recipe);
   optSetWorkflowKeyword(view, "PIWNB", "T", "PI Workflow narrowband RGB composite flag");
   optSetWorkflowKeyword(view, "PIWNBREC", String(recipe || "SHO").toUpperCase(), "PI Workflow narrowband palette");
   optSetWorkflowKeyword(view, "PIWNBR", channels[0], "PI Workflow red channel emission line");
   optSetWorkflowKeyword(view, "PIWNBG", channels[1], "PI Workflow green channel emission line");
   optSetWorkflowKeyword(view, "PIWNBB", channels[2], "PI Workflow blue channel emission line");
   optSetWorkflowProperty(view, "PIW:NB:Flag", true);
   optSetWorkflowProperty(view, "PIW:NB:Recipe", String(recipe || "SHO").toUpperCase());
   optSetWorkflowProperty(view, "PIW:NB:Channels", channels.join(""));
   console.writeln("=> Narrowband metadata: " + view.id + " tagged as " + String(recipe || "SHO").toUpperCase() + " (" + channels.join("/") + ")" + (originText ? " from " + originText : "") + ".");
}

function optWorkflowKeyForView(dialog, view) {
   if (!dialog || !dialog.store || !optSafeView(view))
      return "";
   try {
      if (dialog.preTab && dialog.preTab.preview && optSafeView(dialog.preTab.preview.currentView) && dialog.preTab.preview.currentView.id === view.id)
         return dialog.preTab.preview.currentKey || "";
   } catch (e0) {}
   try {
      if (dialog.stretchTab && dialog.stretchTab.preview && optSafeView(dialog.stretchTab.preview.currentView) && dialog.stretchTab.preview.currentView.id === view.id)
         return dialog.stretchTab.preview.currentKey || "";
   } catch (e1) {}
   try {
      if (dialog.ccTab && dialog.ccTab.preview && optSafeView(dialog.ccTab.preview.currentView) && dialog.ccTab.preview.currentView.id === view.id)
         return dialog.ccTab.preview.currentKey || "";
   } catch (e2) {}
   try {
      if (dialog.postTab && dialog.postTab.preview && optSafeView(dialog.postTab.preview.currentView) && dialog.postTab.preview.currentView.id === view.id)
         return dialog.postTab.preview.currentKey || "";
   } catch (e3) {}
   try {
      for (var key in dialog.store.records) {
         if (!optHasOwn(dialog.store.records, key))
            continue;
         var rec = dialog.store.records[key];
         if (rec && optSafeView(rec.view) && rec.view.id === view.id)
            return key;
      }
   } catch (e4) {}
   return "";
}

function optNarrowbandRecipeFromView(view, dialog, explicitKey) {
   var rec = optReadWorkflowKeyword(view, "PIWNBREC");
   if (optIsNarrowbandRecipeName(rec))
      return rec.toUpperCase();
   var prop = optSafeViewProperty(view, "PIW:NB:Recipe");
   try {
      if (prop != null && optIsNarrowbandRecipeName(prop.toString()))
         return prop.toString().toUpperCase();
   } catch (e0) {}
   try {
      var id = String(view.id || "").toUpperCase();
      var marker = "NB_RGB_";
      var p = id.indexOf(marker);
      if (p >= 0) {
         var tail = id.substr(p + marker.length).replace(/[^A-Z0-9].*$/, "");
         if (optIsNarrowbandRecipeName(tail))
            return tail;
      }
   } catch (e1) {}
   var key = String(explicitKey || "").toUpperCase();
   if (key === "HSO") {
      var chosen = "SHO";
      try { chosen = dialog.selectedRecipe || "SHO"; } catch (e2) {}
      if (optIsNarrowbandRecipeName(chosen))
         return String(chosen).toUpperCase();
      return "SHO";
   }
   if (optIsNarrowbandRecipeName(key))
      return key;
   return "";
}

function optNarrowbandProfileFromRecipe(recipe) {
   if (!optIsNarrowbandRecipeName(recipe))
      return null;
   var channels = optRecipeChannels(recipe);
   var r = optNarrowbandLine(channels[0]);
   var g = optNarrowbandLine(channels[1]);
   var b = optNarrowbandLine(channels[2]);
   if (!r || !g || !b)
      return null;
   return {
      isNarrowband: true,
      isMono: false,
      recipe: String(recipe || "SHO").toUpperCase(),
      channels: channels,
      linesRGB: [r, g, b],
      description: String(recipe || "SHO").toUpperCase() + " (" + r.shortName + "/" + g.shortName + "/" + b.shortName + ")"
   };
}

function optNarrowbandProfileFromMonoKey(key) {
   var k = String(key || "").toUpperCase();
   if (k === "H" || k === "O" || k === "S") {
      var line = optNarrowbandLine(k);
      return {
         isNarrowband: true,
         isMono: true,
         recipe: k,
         channels: [k],
         monoLine: line,
         linesRGB: [line, line, line],
         description: line.shortName + " mono"
      };
   }
   return null;
}

function optGetNarrowbandProfileForView(view, dialog, explicitKey) {
   if (!optSafeView(view))
      return null;
   var key = String(explicitKey || "").toUpperCase();
   if (!key || key.length < 1)
      key = optWorkflowKeyForView(dialog, view);
   var mono = optNarrowbandProfileFromMonoKey(key);
   if (mono)
      return mono;
   var recipe = optNarrowbandRecipeFromView(view, dialog, key);
   if (recipe)
      return optNarrowbandProfileFromRecipe(recipe);
   return null;
}

function optProcessParameterSetCount(P, propertyNames, value) {
   return optSetOptionalProcessProperty(P, propertyNames, value) ? 1 : 0;
}

function optApplyNarrowbandLineToProcess(P, channelTags, line) {
   if (!P || !line)
      return 0;
   var count = 0;
   for (var i = 0; i < channelTags.length; ++i) {
      var c = channelTags[i];
      count += optProcessParameterSetCount(P, [
         c + "FilterName", c + "Filter", c + "FilterId", c + "filterName", c + "filter",
         c + "NarrowbandFilter", c + "narrowbandFilter"
      ], line.name);
      count += optProcessParameterSetCount(P, [
         c + "FilterWavelength", c + "Wavelength", c + "CentralWavelength", c + "CenterWavelength",
         c + "filterWavelength", c + "wavelength", c + "centralWavelength", c + "centerWavelength"
      ], line.wavelength);
      count += optProcessParameterSetCount(P, [
         c + "FilterBandwidth", c + "Bandwidth", c + "FWHM", c + "filterBandwidth", c + "bandwidth", c + "fwhm"
      ], line.bandwidth);
   }
   return count;
}

function optApplyNarrowbandProcessParameters(P, profile, processName, guiConfiguredIcon) {
   if (!P || !profile || !profile.isNarrowband)
      return 0;
   var count = 0;
   count += optProcessParameterSetCount(P, ["narrowbandMode", "narrowBandMode", "useNarrowband", "narrowband", "NarrowbandMode"], true);
   var modeParam = optSetOptionalProcessProperty(P, ["workingMode", "WorkingMode", "calibrationMode", "CalibrationMode", "filterMode", "FilterMode"], "Narrowband");
   if (modeParam)
      ++count;
   else
      count += optProcessParameterSetCount(P, ["workingMode", "WorkingMode", "calibrationMode", "CalibrationMode", "filterMode", "FilterMode"], 1);
   count += optProcessParameterSetCount(P, ["palette", "Palette", "narrowbandPalette", "NarrowbandPalette"], profile.recipe);

   var r = profile.linesRGB[0], g = profile.linesRGB[1], b = profile.linesRGB[2];
   count += optApplyNarrowbandLineToProcess(P, ["red", "Red", "R", "channel0", "Channel0", "channel1", "Channel1"], r);
   count += optApplyNarrowbandLineToProcess(P, ["green", "Green", "G", "channel2", "Channel2"], g);
   count += optApplyNarrowbandLineToProcess(P, ["blue", "Blue", "B", "channel3", "Channel3"], b);

   if (profile.isMono && profile.monoLine) {
      count += optProcessParameterSetCount(P, ["filterName", "FilterName", "narrowbandFilterName", "NarrowbandFilterName"], profile.monoLine.name);
      count += optProcessParameterSetCount(P, ["filterWavelength", "FilterWavelength", "centralWavelength", "CentralWavelength", "wavelength", "Wavelength"], profile.monoLine.wavelength);
      count += optProcessParameterSetCount(P, ["filterBandwidth", "FilterBandwidth", "bandwidth", "Bandwidth", "fwhm", "FWHM"], profile.monoLine.bandwidth);
   }

   if (count > 0)
      console.writeln("=> " + processName + ": narrowband profile applied: " + profile.description + " (" + count + " process parameter assignments).");
   else if (guiConfiguredIcon === true)
      console.writeln("=> " + processName + ": narrowband profile handled by configured process icon for " + profile.description + "; this PixInsight build did not expose scriptable NB filter parameters.");
   else
      console.warningln("=> " + processName + ": narrowband profile detected (" + profile.description + "), but this process instance exposes no known scriptable NB parameters. Use a configured " + processName + "_NB icon if your PixInsight build requires GUI-only filter selection.");
   return count;
}

// MGC-MARS-FILTERS: MultiscaleGradientCorrection selects its MARS reference per channel via
// grayMARSFilter / redMARSFilter / greenMARSFilter / blueMARSFilter (real property names,
// verified from MGC .toSource()). The MARS DR2 database groups its reference images by `filter`,
// and the real groups present are R, G, B, **Ha**, **OIII** (verified by reading the .xmars file
// directly) — i.e. MARS provides GENUINE narrowband Ha and OIII references, not just broadband.
// There is no SII group yet, so SII falls back to broadband "R". We therefore map each emission
// line to its real MARS group. The previous generic optApplyNarrowbandProcessParameters set ~30
// guessed names (none of which MGC exposes) and never reached MGC.
function optMarsFilterForLine(line) {
   if (!line) return "L";
   var id = String(line.id || "").toUpperCase();
   var nm = String(line.name || "").toLowerCase();
   var wl = (typeof line.wavelength === "number" && isFinite(line.wavelength)) ? line.wavelength : 0;
   if (id === "H" || nm.indexOf("alpha") >= 0 || nm === "ha" || (wl >= 650 && wl <= 663)) return "Ha";    // MARS NB Ha group
   if (id === "O" || nm.indexOf("oiii") >= 0 || (wl >= 495 && wl <= 506)) return "OIII";                  // MARS NB OIII group
   if (id === "S" || nm.indexOf("sii") >= 0 || (wl >= 668 && wl <= 678)) return "R";                      // no MARS SII -> broadband red
   if (wl >= 590) return "R";                                                                             // generic broadband fallback
   if (wl >= 495) return "G";
   if (wl > 0)    return "B";
   return "L";
}

function optApplyMGCMarsFilters(mgc, profile, guiConfiguredIcon) {
   if (!mgc || !profile || !profile.isNarrowband)
      return 0;   // broadband / no profile -> leave MGC's default L/R/G/B filters
   if (guiConfiguredIcon === true) {
      console.writeln("=> MGC/MARS: narrowband filters handled by the user-configured MGC_NB icon (" + profile.description + ").");
      return 0;   // respect the user's icon configuration
   }
   var n = 0;
   if (profile.isMono && profile.monoLine) {
      var f = optMarsFilterForLine(profile.monoLine);
      try { mgc.grayMARSFilter = f; ++n; } catch (e0) {}
      console.writeln("=> MGC/MARS: mono " + profile.monoLine.name + " -> grayMARSFilter=" + f + ".");
   } else if (profile.linesRGB && profile.linesRGB.length >= 3) {
      var fr = optMarsFilterForLine(profile.linesRGB[0]);
      var fg = optMarsFilterForLine(profile.linesRGB[1]);
      var fb = optMarsFilterForLine(profile.linesRGB[2]);
      try { mgc.redMARSFilter = fr; ++n; } catch (e1) {}
      try { mgc.greenMARSFilter = fg; ++n; } catch (e2) {}
      try { mgc.blueMARSFilter = fb; ++n; } catch (e3) {}
      console.writeln("=> MGC/MARS: NB palette " + (profile.recipe || profile.description) +
                      " -> MARS filters R=" + fr + " G=" + fg + " B=" + fb + ".");
   }
   return n;
}

// DIRECT-PROCESS-BEGIN: default SPFC system response for the iconless path.
// QE = "Ideal QE curve" (flat, equipment-independent). The RGB filter curves below are
// GENERIC broadband approximations (ideal RGB passbands), NOT tied to any specific
// camera/filter set, so SPFC can run without an icon on any equipment. For accurate
// photometry with your real sensor QE and filters, configure an 'SPFC' process icon
// (it overrides this default), or edit these constants for your equipment.
var OPT_SPFC_DEFAULT_QE_CURVE = "1,1,500,1,1000,1,1500,1,2000,1,2500,1";
var OPT_SPFC_DEFAULT_QE_NAME = "Ideal QE curve";
var OPT_SPFC_DEFAULT_RED_NAME = "Generic broadband R (ideal)";
var OPT_SPFC_DEFAULT_GREEN_NAME = "Generic broadband G (ideal)";
var OPT_SPFC_DEFAULT_BLUE_NAME = "Generic broadband B (ideal)";
var OPT_SPFC_DEFAULT_RED_TRCURVE = "380,0.00,500,0.00,560,0.05,585,0.40,610,0.85,640,0.90,670,0.90,700,0.85";
var OPT_SPFC_DEFAULT_GREEN_TRCURVE = "380,0.00,450,0.03,480,0.30,510,0.80,530,0.90,555,0.85,580,0.45,610,0.10,700,0.00";
var OPT_SPFC_DEFAULT_BLUE_TRCURVE = "380,0.85,420,0.90,450,0.90,480,0.78,505,0.45,530,0.12,560,0.02,700,0.00";

// Apply the default broadband system response (Ideal QE + RGB filter curves) to a bare
// SPFC instance. Narrowband parameters, if any, are applied afterwards by the caller.
function optConfigureDefaultSPFC(spfc) {
   if (!spfc)
      return spfc;
   try {
      spfc.deviceQECurve = OPT_SPFC_DEFAULT_QE_CURVE;
      spfc.deviceQECurveName = OPT_SPFC_DEFAULT_QE_NAME;
      spfc.grayFilterTrCurve = OPT_SPFC_DEFAULT_QE_CURVE;
      spfc.grayFilterName = OPT_SPFC_DEFAULT_QE_NAME;
      spfc.redFilterTrCurve = OPT_SPFC_DEFAULT_RED_TRCURVE;
      spfc.redFilterName = OPT_SPFC_DEFAULT_RED_NAME;
      spfc.greenFilterTrCurve = OPT_SPFC_DEFAULT_GREEN_TRCURVE;
      spfc.greenFilterName = OPT_SPFC_DEFAULT_GREEN_NAME;
      spfc.blueFilterTrCurve = OPT_SPFC_DEFAULT_BLUE_TRCURVE;
      spfc.blueFilterName = OPT_SPFC_DEFAULT_BLUE_NAME;
   } catch (e0) {}
   return spfc;
}
// DIRECT-PROCESS-END

function optGetSPFCProcessForProfile(profile) {
   if (profile && profile.isNarrowband) {
      if (profile.isMono && profile.monoLine) {
         var monoIcon = "SPFC_" + profile.monoLine.id;
         var mono = optGetProcessIconInstance(monoIcon, "SpectrophotometricFluxCalibration", true);
         if (mono != null) {
            console.writeln("=> Running user-configured '" + monoIcon + "' process icon for " + profile.description + ".");
            return mono;
         }
      }
      var nb = optGetProcessIconInstance("SPFC_NB", "SpectrophotometricFluxCalibration", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'SPFC_NB' process icon for " + profile.description + ".");
         return nb;
      }
   }
   var spfc = optGetProcessIconInstance("SPFC", "SpectrophotometricFluxCalibration");
   if (spfc != null) {
      console.writeln("=> Running user-configured 'SPFC' process icon.");
      return spfc;
   }
   // DIRECT-PROCESS-BEGIN: no icon configured → run SPFC directly with defaults. The
   // Gaia DR3/SP database is taken from PixInsight's global configuration (catalogId
   // "GaiaDR3SP"); narrowband filter parameters are applied by the caller. Icon stays
   // as an optional override when present.
   if (OPT_DIRECT_PROCESS_INSTANTIATION) {
      console.writeln("=> No 'SPFC' icon found; using a default SpectrophotometricFluxCalibration instance (Ideal QE + configured broadband filters, global Gaia config).");
      return optConfigureDefaultSPFC(new SpectrophotometricFluxCalibration());
   }
   // DIRECT-PROCESS-END
   return null;
}

function optGetSPCCProcessForProfile(profile) {
   OPT_LAST_SPCC_GUI_NB_ICON = false;
   if (profile && profile.isNarrowband) {
      var nb = optGetProcessIconInstance("SPCC_NB", "SpectrophotometricColorCalibration", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'SPCC_NB' process icon for " + profile.description + ".");
         OPT_LAST_SPCC_GUI_NB_ICON = true;
         return nb;
      }
   }
   return new SpectrophotometricColorCalibration();
}

// DIRECT-PROCESS-BEGIN: resolve the MARS database file paths for the iconless MGC path.
// The MGC module read-protects its MARS settings, so Settings.readGlobal() cannot see
// them. We therefore read PixInsight's core settings file(s) directly and extract the
// configured MARSDatabaseFilePath<NNN> values. Fully per-user (each machine reads its
// own settings) — no hardcoded paths. Returns an array of [enabled, path] pairs for
// existing files, or [] if none can be resolved.
function optPixInsightConfigDirs() {
   var home = "";
   try { home = optNormalizePath(File.homeDirectory); } catch (e0) {}
   if (!home || home.length === 0)
      return [];
   return [
      home + "/AppData/Roaming/Pleiades",  // Windows (verified)
      home + "/Library/PixInsight",        // macOS (verified)
      home + "/.PixInsight",               // Linux (best effort)
      home + "/.config/PixInsight",        // Linux (best effort)
      home + "/.config/Pleiades"           // Linux (best effort)
   ];
}

function optResolveMarsDatabaseFiles() {
   var out = [];
   var seen = {};
   function pad3(i) { var s = "" + i; while (s.length < 3) s = "0" + s; return s; }
   function existsSafe(p) { try { return File.exists(p); } catch (e) { return false; } }

   // 1) Cheap path: the global module settings space. Works on builds that do not
   //    read-protect these keys; harmless (and skipped) when they do.
   try {
      if (typeof Settings !== "undefined" && typeof Settings.readGlobal === "function") {
         for (var gi = 0; gi < 64; ++gi) {
            var gval = null;
            try { gval = Settings.readGlobal("MultiscaleProcessing/MARSDatabaseFilePath" + pad3(gi), DataType_String); }
            catch (eg) { gval = null; }
            if (gval === null || gval === undefined || String(gval).length === 0)
               break;
            var gp = String(gval);
            if (!seen[gp] && existsSafe(gp)) { seen[gp] = true; out.push([true, gp]); }
         }
         if (out.length > 0)
            return out;
      }
   } catch (eG) {}

   // 2) Read PixInsight's core settings file(s) directly. Only genuine instance files
   //    (core-<n>-pxi.settings) — skips *_OLD backups and unrelated files.
   var dirs = optPixInsightConfigDirs();
   var nameRe = new RegExp("^core-\\d+-pxi\\.settings$");
   var valRe = new RegExp('<v k="MARSDatabaseFilePath\\d+" t="s">([^<]*)<', "g");
   for (var d = 0; d < dirs.length; ++d) {
      var dir = dirs[d];
      try { if (!File.directoryExists(dir)) continue; } catch (eD) { continue; }
      var fileList = [];
      try {
         var ff = new FileFind();
         if (ff.begin(dir + "/core-*.settings")) {
            do { if (ff.name && nameRe.test(ff.name)) fileList.push(dir + "/" + ff.name); } while (ff.next());
         }
         try { ff.end(); } catch (eE) {}
      } catch (eF) {}
      for (var fi = 0; fi < fileList.length; ++fi) {
         var txt = "";
         try { txt = File.readTextFile(fileList[fi]); } catch (eR) { continue; }
         var m;
         valRe.lastIndex = 0;
         while ((m = valRe.exec(txt)) !== null) {
            var p = m[1];
            if (p && !seen[p] && existsSafe(p)) { seen[p] = true; out.push([true, p]); }
         }
      }
      if (out.length > 0)
         break; // first config dir that yields paths wins
   }
   return out;
}
// DIRECT-PROCESS-END

function optGetMGCProcessForProfile(profile) {
   if (profile && profile.isNarrowband) {
      var nb = optGetProcessIconInstance("MGC_NB", "MultiscaleGradientCorrection", true);
      if (nb != null) {
         console.writeln("=> Running user-configured 'MGC_NB' process icon for " + profile.description + ".");
         return { process: nb, guiConfiguredIcon: true };
      }
   }
   var mgc = optGetProcessIconInstance("MGC", "MultiscaleGradientCorrection");
   if (mgc != null) {
      console.writeln("=> Running user-configured 'MGC' process icon.");
      return { process: mgc, guiConfiguredIcon: false };
   }
   // DIRECT-PROCESS-BEGIN: no icon configured → run MGC directly. Enable the MARS
   // database so MGC uses PixInsight's globally-configured MARS repository as its
   // reference (default MARS filters L/R/G/B). Icon stays as an optional override.
   if (OPT_DIRECT_PROCESS_INSTANTIATION) {
      var mgcDirect = new MultiscaleGradientCorrection();
      var marsFiles = optResolveMarsDatabaseFiles();
      if (marsFiles.length > 0) {
         try {
            mgcDirect.useMARSDatabase = true;
            mgcDirect.marsDatabaseFiles = marsFiles;
         } catch (eMars) {}
         console.writeln("=> No 'MGC' icon found; using a default MultiscaleGradientCorrection instance with " +
                         marsFiles.length + " MARS database file(s) read from PixInsight settings.");
      } else {
         try { mgcDirect.useMARSDatabase = true; } catch (eMars2) {}
         console.warningln("=> No 'MGC' icon found and no MARS database files could be resolved from PixInsight settings. " +
                           "Define the default MARS files in the MultiscaleGradientCorrection Preferences (wrench icon), " +
                           "or configure an 'MGC' process icon.");
      }
      return { process: mgcDirect, guiConfiguredIcon: false };
   }
   // DIRECT-PROCESS-END
   return { process: null, guiConfiguredIcon: false };
}

