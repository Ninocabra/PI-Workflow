#engine v8
// SSSC F0 probe v3: does a normal (non-automation) script run load the Gaia module
// database configuration? Report databaseFilePaths + a real search result.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_probe_gaia3.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
try {
   var G = new Gaia;
   L("dataRelease = " + G.dataRelease);
   try { L("databaseFilePaths.length = " + (G.databaseFilePaths ? G.databaseFilePaths.length : "n/a")); } catch(e0){ L("dbfp err"); }
   try { if (G.databaseFilePaths) for (var i=0;i<G.databaseFilePaths.length;++i) L("  db["+i+"]="+G.databaseFilePaths[i]); } catch(e1){}
   G.command = "search";
   G.centerRA = 10.6847; G.centerDec = 41.2687; G.radius = 0.08;
   G.magnitudeLow = -1.5; G.magnitudeHigh = 14.0;
   G.sourceLimit = 4294967295;
   G.normalizeSpectrum = false; G.photonFluxUnits = false;
   G.generateTextOutput = false; G.generateBinaryOutput = false;
   G.verbosity = 1;
   var ok = false; try { ok = G.executeGlobal(); } catch(eX){ L("executeGlobal threw: "+eX.message); }
   var S = G.sources; var n = S ? S.length : 0;
   L("search ok=" + ok + " sources=" + n);
   if (n > 0) {
      var s0 = S[0];
      L("source[0] len=" + s0.length + " magG=" + s0[5] + " magBP=" + s0[6] + " magRP=" + s0[7]);
      var flux = s0[9];
      L("flux typeof=" + (typeof flux) + " len=" + (flux && flux.length));
      if (flux && flux.length) { var h=[]; for (var k=0;k<Math.min(6,flux.length);++k) h.push(flux[k]); L("flux head: "+h.join(", ")); }
   }
   L("PROBE3 DONE.");
} catch(e) { L("ERROR: " + e.message); }
