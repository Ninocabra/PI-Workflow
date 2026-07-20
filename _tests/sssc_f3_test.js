#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC F3 ground-truth self-test (headless):
//  Inject a known camera 3x3 with cross-channel leakage. Use 2-D-diverse spectra
//  (blackbody x random spectral feature) so the calibrators are NOT on a 1-D locus —
//  otherwise a diagonal+slope (Stage 2) is indistinguishable from a full 3x3. Verify
//  Stage 3 recovers the matrix (tiny residual) and clearly beats Stage 2; plus apply.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_f3_test.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
var _seed = 555;
function rnd(){ _seed = (1103515245 * _seed + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }
var grid = { start: 336, step: 2, count: 343 };
function blackbody(T){ var c2=1.4388e7,o=[]; for(var k=0;k<grid.count;++k){var lam=grid.start+k*grid.step,x=c2/(lam*T);o.push(x>80?0:1/(Math.pow(lam,4)*(Math.exp(x)-1)));} return o; }
// blackbody modulated by a random smooth spectral feature -> breaks the 1-D locus
function diverseSpectrum(){
   var T = 3000 + 9000*rnd();
   var sp = blackbody(T);
   var amp = 0.6*rnd(), period = 60 + 160*rnd(), phase = 6.283*rnd();
   for (var k=0;k<grid.count;++k){ var lam=grid.start+k*grid.step; sp[k] *= (1 + amp*Math.sin((lam-336)/period*6.283 + phase)); if (sp[k]<0) sp[k]=0; }
   return sp;
}

try {
   var Mtrue = [[1.10, 0.12, 0.04],
                [0.06, 1.00, 0.07],
                [0.05, 0.14, 0.85]];
   var stars = [];
   for (var i = 0; i < 160; ++i) {
      var sp = diverseSpectrum();
      var e = optSSSCIntegrateSpectrum(sp, grid);
      var bright = 0.5 + rnd();
      var nR=1+(rnd()-0.5)*0.01, nG=1+(rnd()-0.5)*0.01, nB=1+(rnd()-0.5)*0.01;
      stars.push({ ok:true, flux:sp,
         Rm: (Mtrue[0][0]*e[0]+Mtrue[0][1]*e[1]+Mtrue[0][2]*e[2])*bright*nR,
         Gm: (Mtrue[1][0]*e[0]+Mtrue[1][1]*e[1]+Mtrue[1][2]*e[2])*bright*nG,
         Bm: (Mtrue[2][0]*e[0]+Mtrue[2][1]*e[1]+Mtrue[2][2]*e[2])*bright*nB });
   }

   var gains = optSSSCFitStage1Gains(stars, grid);
   var s2 = optSSSCFitStage2Response(stars, grid, gains, { minStars: 50 });
   var s3 = optSSSCFitStage3CCM(stars, grid, { minStars: 30 });
   L("Stage1 (implied) residual RMS = " + s2.stage1Rms.toFixed(4));
   L("Stage2 residual RMS = " + s2.stage2Rms.toFixed(4));
   L("Stage3 residual RMS = " + s3.rms.toFixed(4));
   L("Stage3/Stage2 = " + (s3.rms/s2.stage2Rms).toFixed(3) + " (lower = Stage3 better)");
   // Stage 3 must clearly beat Stage 2 when genuine 2-D cross-channel signal exists
   // (a small ridge trades a little recovery for robustness, so we judge relative gain).
   var pass1 = (s3.rms < 0.8 * s2.stage2Rms);
   L("STAGE3 ACCURACY: " + (pass1 ? "PASS" : "FAIL"));

   // Apply: neutral-target gray -> camera measures Mtrue*[t,t,t]; after CCM must be ~neutral.
   var W=24,H=24,N=W*H, Rr=new Float32Array(N),Gg=new Float32Array(N),Bb=new Float32Array(N);
   for(var p=0;p<N;++p){ var t=0.2+0.2*rnd();
      Rr[p]=(Mtrue[0][0]+Mtrue[0][1]+Mtrue[0][2])*t;
      Gg[p]=(Mtrue[1][0]+Mtrue[1][1]+Mtrue[1][2])*t;
      Bb[p]=(Mtrue[2][0]+Mtrue[2][1]+Mtrue[2][2])*t; }
   var win=new ImageWindow(W,H,3,32,true,true,"sssc_f3_img"); var mv=win.mainView,rect=new Rect(0,0,W,H);
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(Rr,rect,0); mv.image.setSamples(Gg,rect,1); mv.image.setSamples(Bb,rect,2);
   mv.endProcess();
   optSSSCApplyCCM(mv, s3);
   var bad=false;
   for(var c=0;c<3;++c) for(var yy=0;yy<H;yy+=3) for(var xx=0;xx<W;xx+=3){ var v=mv.image.sample(xx,yy,c); if(!isFinite(v)||v<0) bad=true; }
   var aR=mv.image.sample(12,12,0),aG=mv.image.sample(12,12,1),aB=mv.image.sample(12,12,2);
   L("neutral check after CCM: R/G=" + (aR/aG).toFixed(3) + " B/G=" + (aB/aG).toFixed(3) + " (expect ~1.0)");
   var neutralOk = Math.abs(aR/aG-1) < 0.04 && Math.abs(aB/aG-1) < 0.04;
   L("APPLY sanity: " + (!bad && neutralOk ? "PASS" : "FAIL"));
   win.forceClose();

   L("F3 DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
