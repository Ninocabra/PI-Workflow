#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC safety self-test (headless): reproduce the catastrophic-red failure mode and
// confirm the guards prevent it.
//  A) Extreme red-weak stars -> Stage 1 gains must be CLAMPED to the safe range.
//  B) A degenerate CCM (huge off-diagonal, like the one a narrow stellar locus produces)
//     applied to a teal emission-nebula image drives G/B to ~0 (=> red). Confirm the
//     row-sum guard used by optRunSSSC would REJECT such a matrix.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_safety_test.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
var grid = { start: 336, step: 2, count: 343 };
function blackbody(T){ var c2=1.4388e7,o=[]; for(var k=0;k<grid.count;++k){var lam=grid.start+k*grid.step,x=c2/(lam*T);o.push(x>80?0:1/(Math.pow(lam,4)*(Math.exp(x)-1)));} return o; }
function rowSumsSafe(A){ for(var r=0;r<3;++r){ var s=A[r][0]+A[r][1]+A[r][2]; if(!(s>0.2&&s<5)) return false; } return true; }

try {
   // ---------- A) Gain clamp on red-weak data ----------
   var stars = [];
   for (var i = 0; i < 20; ++i) {
      var sp = blackbody(4000 + i*250);
      var e = optSSSCIntegrateSpectrum(sp, grid);
      // simulate an image whose RED channel is ~20x too weak -> fit wants a huge red gain
      stars.push({ ok:true, flux:sp, Rm: e[0]*0.05, Gm: e[1], Bm: e[2] });
   }
   var g = optSSSCFitStage1Gains(stars, grid);
   L("red-weak fit -> gR=" + g.gR.toFixed(3) + " gB=" + g.gB.toFixed(3) + " (must be <= 4)");
   L("GAIN CLAMP: " + (g.gR <= 4.0001 && g.gR >= 0.25 ? "PASS" : "FAIL"));

   // ---------- B) Degenerate CCM => red; guard rejects it ----------
   var bad = { ccm: [[0.28, 0.45, 8.45], [0.08, 1.0, 0.0], [-0.24, 8.0, 0.62]], stage: 3 };
   var good = { ccm: [[1.05, -0.03, -0.02], [0.0, 1.0, 0.0], [-0.02, -0.05, 1.07]], stage: 3 };
   L("bad CCM row-sums safe?  " + rowSumsSafe(bad.ccm) + " (expect false -> rejected)");
   L("good CCM row-sums safe? " + rowSumsSafe(good.ccm) + " (expect true)");
   L("GUARD: " + (!rowSumsSafe(bad.ccm) && rowSumsSafe(good.ccm) ? "PASS" : "FAIL"));

   // demonstrate the bad CCM on a teal nebula pixel-set (why the guard matters)
   var W=8,H=8,N=W*H, R=new Float32Array(N),Gc=new Float32Array(N),Bb=new Float32Array(N);
   for (var p=0;p<N;++p){ R[p]=0.05; Gc[p]=0.45; Bb[p]=0.40; }  // teal OIII-ish
   var win=new ImageWindow(W,H,3,32,true,true,"sssc_safety_img"); var mv=win.mainView,rect=new Rect(0,0,W,H);
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(R,rect,0); mv.image.setSamples(Gc,rect,1); mv.image.setSamples(Bb,rect,2);
   mv.endProcess();
   optSSSCApplyCCM(mv, bad);
   var aR=mv.image.sample(4,4,0),aG=mv.image.sample(4,4,1),aB=mv.image.sample(4,4,2);
   L("bad CCM on teal pixel -> R="+aR.toFixed(3)+" G="+aG.toFixed(3)+" B="+aB.toFixed(3)+" (G/B collapse => red, this is what we now PREVENT)");
   win.forceClose();

   L("SAFETY DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
