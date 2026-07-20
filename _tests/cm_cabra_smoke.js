#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Parse + symbol smoke test for the CabraMagic executor, and report which native
// tools are installed on this machine (for the GUI test plan).
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/cm_cabra_smoke.log";
var B = "";
function L(s){ B+=String(s)+"\n"; try{File.writeTextFile(LOG,B);}catch(e){} }
try {
   L("optCabraMagicRun     = " + (typeof optCabraMagicRun));
   L("optCabraToolAvailable= " + (typeof optCabraToolAvailable));
   L("optCabraBuildRecipe  = " + (typeof optCabraBuildRecipe));
   L("optDetailDefaultState= " + (typeof optDetailDefaultState));
   L("optApplyHueSat...    = " + (typeof optApplyHueSaturationCorrectionToView));
   L("--- installed tools on this machine ---");
   L("BlurXTerminator : " + optCabraToolAvailable(["BlurXTerminator"]));
   L("NoiseXTerminator: " + optCabraToolAvailable(["NoiseXTerminator"]));
   L("Parallax(SyQon) : " + ((typeof optIsParallaxAvailable==="function") ? optIsParallaxAvailable() : "n/a"));
   L("Prism(SyQon)    : " + ((typeof optIsPrismAvailable==="function") ? optIsPrismAvailable() : "n/a"));
   L("AutoDBE         : " + ((typeof optIsAutoDBEAvailable==="function") ? optIsAutoDBEAvailable() : "n/a"));
   L("--- Color Mixer simplification ---");
   var cms = optColorMixerDefaultState();
   L("colorMixer.selectivity = " + cms.selectivity + " (expect 0.5)");
   L("colorMixer.bands       = " + (cms.bands ? cms.bands.length : "n/a"));
   L("optBuildColorMixerMaskView = " + (typeof optBuildColorMixerMaskView));
   // Functional: run Color Mixer with a per-band VIBRANCE push on a synthetic RGB image.
   var win = new ImageWindow(64, 64, 3, 32, true, true, "cm_vib_test");
   var mv = win.mainView, im = mv.image, rect = new Rect(0, 0, 64, 64);
   var N = 64 * 64;
   var Rr = new Float32Array(N), Gg = new Float32Array(N), Bb = new Float32Array(N);
   for (var k = 0; k < N; ++k) { Rr[k] = 0.40; Gg[k] = 0.18; Bb[k] = 0.16; } // faint reddish, low sat
   mv.beginProcess(UndoFlag_NoSwapFile);
   im.setSamples(Rr, rect, 0); im.setSamples(Gg, rect, 1); im.setSamples(Bb, rect, 2);
   mv.endProcess();
   var st = optColorMixerDefaultState();
   st.protectStars = false; st.protectLowSat = false;
   st.bands[0].vibrance = 60;   // Red band, +60 vibrance
   var before = im.sample(10, 10, 0) - im.sample(10, 10, 1);
   optRunColorMixerOnView(mv, st);
   var after = im.sample(10, 10, 0) - im.sample(10, 10, 1);
   L("vibrance R-G chroma: before=" + before.toFixed(4) + " after=" + after.toFixed(4) + " (expect after > before)");
   L("vibrance result: " + (after > before + 1e-4 ? "PASS" : "FAIL"));
   win.forceClose();
   L("OK: engine parsed and all CabraMagic + Color Mixer symbols present.");
} catch(e){ L("ERROR: "+e.message+(e.stack?("\n"+e.stack):"")); }
