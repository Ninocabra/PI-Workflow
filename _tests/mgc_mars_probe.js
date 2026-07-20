// TEMP PROBE (2026-06-29): dump the REAL MultiscaleGradientCorrection API + the MARS-related
// settings keys present on this machine, to see whether the script reads obsolete MARS paths.
// Standalone (no engine include). Run: PixInsight -n=200 --automation-mode -r=".../mgc_mars_probe.js" --force-exit
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_200/_tests/mgc_mars_probe.log";
var B = "";
function L(s) { B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch (e) {} }

L("=== MultiscaleGradientCorrection .toSource() (reveals the real parameter names) ===");
try {
   var mgc = new MultiscaleGradientCorrection();
   try { L(mgc.toSource()); } catch (eTS) { L("toSource err: " + eTS); }
} catch (e) { L("cannot instantiate MGC: " + e); }

L("\n=== candidate MARS property probes (does the property exist?) ===");
try {
   var m2 = new MultiscaleGradientCorrection();
   var cand = ["useMARSDatabase", "marsDatabaseFiles", "marsDatabase", "databaseFiles", "marsDatabasePath",
               "marsRepository", "useMARS", "marsFilters", "referenceFilter", "filterName", "automaticReference",
               "referenceImage", "useAutoReference", "marsScale", "outputBackgroundModel"];
   for (var i = 0; i < cand.length; ++i) {
      try { var v = m2[cand[i]]; L("  " + cand[i] + " = " + JSON.stringify(v)); }
      catch (eP) { L("  " + cand[i] + " : <no such property>"); }
   }
} catch (e) {}

L("\n=== MARS-related settings keys in core-*.settings (current vs obsolete) ===");
var home = ""; try { home = File.homeDirectory; } catch (e) {}
var dirs = [home + "/AppData/Roaming/Pleiades", home + "/Library/PixInsight", home + "/.PixInsight",
            home + "/.config/PixInsight", home + "/.config/Pleiades"];
var keyRe = new RegExp('<v k="([^"]*[Mm][Aa][Rr][Ss][^"]*)"[^>]*>([^<]*)<', "g");
function existsSafe(p) { try { return File.exists(p); } catch (e) { return false; } }
for (var d = 0; d < dirs.length; ++d) {
   try { if (!File.directoryExists(dirs[d])) continue; } catch (e) { continue; }
   var ff = new FileFind();
   try {
      if (ff.begin(dirs[d] + "/core-*.settings")) {
         do {
            if (ff.name && /^core-\d+-pxi\.settings$/.test(ff.name)) {
               var fp = dirs[d] + "/" + ff.name; L("--- " + fp + " ---");
               var txt = ""; try { txt = File.readTextFile(fp); } catch (eR) { L("  (read err)"); continue; }
               var m, n = 0; keyRe.lastIndex = 0;
               while ((m = keyRe.exec(txt)) !== null) {
                  var val = m[2], tag = "";
                  if (/[\/\\]/.test(val)) tag = existsSafe(val) ? "  [EXISTS]" : "  [MISSING - obsolete?]";
                  L("  " + m[1] + " = " + val + tag); n++;
               }
               if (n === 0) L("  (no MARS keys in this file)");
            }
         } while (ff.next());
      }
   } catch (eF) {}
   try { ff.end(); } catch (e) {}
}
L("\n=== DONE ===");
