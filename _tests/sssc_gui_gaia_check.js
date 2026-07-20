#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC F0 LIVE check — RUN THIS IN YOUR OPEN PIXINSIGHT GUI (Script > Execute Script File),
// where the Gaia DR3SP (gdr3sp) database is configured. It confirms the live Gaia query
// returns BP/RP spectra, reports the real wavelength grid, and (if a plate-solved linear
// RGB image is active) runs the full F0 path end to end. Writes a log file.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_gui_gaia_check.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} console.writeln(s); }

try {
   L("=== SSSC F0 live Gaia check ===");
   if (typeof Gaia === "undefined") { L("Gaia process NOT installed."); throw new Error("no Gaia"); }

   // 1) Raw Gaia search at a fixed field to confirm spectra + read the grid.
   var G = new Gaia;
   G.command = "search";
   G.centerRA = 10.6847; G.centerDec = 41.2687; G.radius = 0.10;
   G.magnitudeLow = 7.0; G.magnitudeHigh = 14.0; G.sourceLimit = 4294967295;
   G.normalizeSpectrum = false; G.photonFluxUnits = true;
   G.generateTextOutput = false; G.generateBinaryOutput = false; G.verbosity = 1;
   var ok = G.executeGlobal();
   L("raw search ok=" + ok + " sources=" + (G.sources ? G.sources.length : 0));
   // Probe spectrum-grid properties (whatever names the process exposes).
   var names = ["spectrumStart","spectrumStep","spectrumCount","spectrumBits"];
   for (var i = 0; i < names.length; ++i) { var v; try { v = G[names[i]]; } catch(e){ v = "(err)"; } L("  G." + names[i] + " = " + v); }
   if (G.sources && G.sources.length) {
      var s0 = G.sources[0], flux = s0[9];
      L("  source[0] magG=" + s0[5] + " magBP=" + s0[6] + " magRP=" + s0[7] + " flux.len=" + (flux && flux.length));
      if (flux && flux.length) {
         var head = []; for (var k = 0; k < Math.min(10, flux.length); ++k) head.push(Number(flux[k]).toExponential(3));
         L("  flux[0..9] = " + head.join(", "));
      }
   }

   // 2) Full F0 path on the active window ONLY if it is already a plate-solved linear RGB
   //    image (never trigger a blind solve on the user's active image without asking).
   var win = ImageWindow.activeWindow;
   if (win && !win.isNull && win.mainView && !win.mainView.isNull &&
       win.mainView.image.numberOfChannels >= 3 && optHasAstrometricSolution(win.mainView)) {
      L("active window: " + win.mainView.id + " (" + win.mainView.image.width + "x" + win.mainView.image.height + ")");
      try {
         var stars = optSSSCQueryGaiaSpectra(win, { magLow: 7.0, magHigh: 16.0 });
         L("optSSSCQueryGaiaSpectra -> " + stars.length + " stars; grid=" +
           (stars.grid ? (stars.grid.start + "/" + stars.grid.step + "/" + stars.grid.count) : "n/a"));
         optSSSCStarPhotometry(win.mainView, stars, {});
         var okN = 0; for (var j = 0; j < stars.length; ++j) if (stars[j].ok) ++okN;
         L("photometry ok on " + okN + "/" + stars.length + " stars.");
         // Show measured vs seed-integrated for the first few good stars.
         var shown = 0;
         for (var m = 0; m < stars.length && shown < 6; ++m) {
            var st = stars[m]; if (!st.ok) continue;
            var ie = optSSSCIntegrateSpectrum(st.flux, stars.grid);
            L("  star magG=" + st.magG.toFixed(2) +
              " measured R/G=" + (st.Rm/st.Gm).toFixed(3) + " B/G=" + (st.Bm/st.Gm).toFixed(3) +
              " | seedExpected R/G=" + (ie[0]/ie[1]).toFixed(3) + " B/G=" + (ie[2]/ie[1]).toFixed(3));
            ++shown;
         }
         L("FULL F0 PATH: OK");
      } catch (eF) { L("FULL F0 PATH error: " + eF.message); }
   } else {
      L("No plate-solved linear RGB active window -> skipped full path (raw Gaia check above is enough).");
   }
   L("DONE.");
} catch (e) { L("ERROR: " + e.message + (e.stack ? ("\n" + e.stack) : "")); }
