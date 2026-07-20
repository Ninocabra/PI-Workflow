#engine v8
// SSSC F0 probe v2: explicitly point the Gaia process at the gdr3sp (spectrum) database
// and find the dataRelease value that returns sources WITH a flux spectrum.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_probe_gaia2.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }

var DBDIR = "E:/Configuracion/PixInsight/Gaia DR3/";
var paths = [];
for (var i = 1; i <= 20; ++i) {
   var nn = (i < 10 ? "0" : "") + i;
   paths.push(DBDIR + "gdr3sp-1.0.0-" + nn + ".xpsd");
}

try {
   var G = new Gaia;
   L("default dataRelease = " + G.dataRelease + ", outputDataRelease = " + G.outputDataRelease);
   try { L("default databaseFilePaths.length = " + (G.databaseFilePaths ? G.databaseFilePaths.length : "n/a")); } catch(e0){ L("databaseFilePaths read err"); }
   for (var pp = 0; pp < paths.length; ++pp) L("db exists [" + pp + "] " + File.exists(paths[pp]) + " : " + paths[pp]);

   // Try to assign the database file paths explicitly.
   var assigned = false;
   try { G.databaseFilePaths = paths; assigned = true; } catch(eA){ L("assign databaseFilePaths ERR: " + eA.message); }
   L("assigned databaseFilePaths = " + assigned);

   function trySearch(dr) {
      var g = new Gaia;
      try { g.databaseFilePaths = paths; } catch(e){}
      g.command = "search";
      g.centerRA = 10.6847; g.centerDec = 41.2687; g.radius = 0.08;
      g.magnitudeLow = -1.5; g.magnitudeHigh = 14.0;
      g.sourceLimit = 4294967295;
      g.requiredFlags = 0; g.inclusionFlags = 0; g.exclusionFlags = 0;
      g.normalizeSpectrum = false; g.photonFluxUnits = false;
      g.generateTextOutput = false; g.generateBinaryOutput = false;
      g.verbosity = 1;
      if (dr !== null) g.dataRelease = dr;
      var ok = false;
      try { ok = g.executeGlobal(); } catch(eX){ L("  dr=" + dr + " executeGlobal threw: " + eX.message); return; }
      var S = g.sources;
      var n = S ? S.length : 0;
      var fluxLen = (n > 0 && S[0] && S[0][9] && S[0][9].length) ? S[0][9].length : 0;
      L("  dr=" + dr + " ok=" + ok + " sources=" + n + " flux[0].len=" + fluxLen +
        (n > 0 ? (" magG=" + S[0][5]) : ""));
      if (fluxLen > 0) {
         var head = [];
         for (var k = 0; k < Math.min(6, fluxLen); ++k) head.push(S[0][9][k].toFixed ? S[0][9][k].toFixed(4) : S[0][9][k]);
         L("    flux head: " + head.join(", "));
      }
   }

   L("--- sweeping dataRelease ---");
   for (var dr = 0; dr <= 6; ++dr) trySearch(dr);
   trySearch(null);

   L("PROBE2 DONE.");
} catch(e) {
   L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : ""));
}
