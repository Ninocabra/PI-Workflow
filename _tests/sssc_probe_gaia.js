#engine v8
// SSSC F0 probe: introspect the Gaia process scripting API and confirm we can pull
// BP/RP sampled spectra (DR3SP) from PJSR. Writes findings to a log file.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_probe_gaia.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }

try {
   L("typeof Gaia = " + (typeof Gaia));
   if (typeof Gaia === "undefined") { L("Gaia process NOT installed."); throw new Error("no Gaia"); }

   // 1) Enum values we might need.
   var G = new Gaia;
   var enumNames = ["DataRelease_3","DataRelease_E3","DataRelease_3SP","DataRelease_4",
                    "SortBy_G","SortBy_GBP","SortBy_GRP"];
   for (var e = 0; e < enumNames.length; ++e) {
      var v;
      try { v = G[enumNames[e]]; } catch(ex){ v = "(err)"; }
      if (v === undefined) try { v = Gaia.prototype[enumNames[e]]; } catch(ex2){}
      L("enum " + enumNames[e] + " = " + v);
   }

   // 2) Relevant property typeof on a fresh instance.
   var props = ["command","dataRelease","normalizeSpectrum","photonFluxUnits",
                "generateTextOutput","generateBinaryOutput","sources",
                "spectrumStart","spectrumStep","spectrumCount","spectrumBits",
                "outputDataRelease","databaseFilePaths","databaseMagnitudeLow","databaseMagnitudeHigh"];
   for (var p = 0; p < props.length; ++p) {
      var t;
      try { t = typeof G[props[p]]; } catch(ex3){ t = "(err)"; }
      L("prop " + props[p] + " : " + t);
   }

   // 3) Real search with spectra requested. M31 area, small radius, bright cut.
   G.command = "search";
   G.centerRA = 10.6847;
   G.centerDec = 41.2687;
   G.radius = 0.10;
   G.magnitudeLow = -1.5;
   G.magnitudeHigh = 15.0;
   G.sourceLimit = 4294967295;
   G.requiredFlags = 0; G.inclusionFlags = 0; G.exclusionFlags = 0;
   G.normalizeSpectrum = false;
   G.photonFluxUnits = false;
   G.generateTextOutput = false;
   G.generateBinaryOutput = false;
   G.verbosity = 2;
   try { G.dataRelease = Gaia.prototype.DataRelease_3; } catch(eDR){}
   var ok = G.executeGlobal();
   L("executeGlobal ok = " + ok);

   // Spectrum grid metadata after search.
   var grid = ["spectrumStart","spectrumStep","spectrumCount","spectrumBits","isSpectrumNormalizationEnabled"];
   for (var gi = 0; gi < grid.length; ++gi) {
      var gv; try { gv = G[grid[gi]]; } catch(eg){ gv = "(err)"; }
      L("after-search " + grid[gi] + " = " + gv);
   }

   var S = G.sources;
   L("sources type = " + (typeof S) + ", length = " + (S ? S.length : "n/a"));
   if (S && S.length > 0) {
      var s0 = S[0];
      L("source[0] length = " + (s0 && s0.length));
      L("source[0] = [ra=" + s0[0] + ", dec=" + s0[1] + ", parx=" + s0[2] + ", magG=" + s0[5] + ", magBP=" + s0[6] + ", magRP=" + s0[7] + "]");
      var flux = s0[9];
      L("source[0].flux typeof = " + (typeof flux) + ", length = " + (flux && flux.length));
      if (flux && flux.length) {
         var head = [];
         for (var k = 0; k < Math.min(8, flux.length); ++k) head.push(flux[k]);
         L("source[0].flux[0..7] = " + head.join(", "));
         // crude integral
         var sum = 0; for (var k2 = 0; k2 < flux.length; ++k2) sum += flux[k2];
         L("source[0].flux sum = " + sum);
      }
   }
   L("PROBE DONE.");
} catch(e) {
   L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
}
