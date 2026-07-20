#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// SSSC F2 ground-truth self-test (headless):
//  Simulate a system whose TRUE effective bands are SHIFTED/scaled vs the seed bands
//  (a genuinely colour-dependent error, not just a scalar cast). Stage 1 alone leaves a
//  colour-dependent residual; Stage 2 must reduce it substantially.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_f2_test.log";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} }
var _seed = 987654321;
function rnd(){ _seed = (1103515245 * _seed + 12345) & 0x7fffffff; return _seed / 0x7fffffff; }

var grid = { start: 336, step: 2, count: 343 };
function blackbody(T){ var c2=1.4388e7,o=[]; for(var k=0;k<grid.count;++k){var lam=grid.start+k*grid.step,x=c2/(lam*T);o.push(x>80?0:1/(Math.pow(lam,4)*(Math.exp(x)-1)));} return o; }
// trapezoid band integral with explicit edges
function intBand(sp, T){
   var s=0;
   for(var k=0;k<grid.count;++k){ var lam=grid.start+k*grid.step,wgt;
      if(lam<=T[0]||lam>=T[3]) wgt=0; else if(lam<T[1]) wgt=(lam-T[0])/(T[1]-T[0]);
      else if(lam>T[2]) wgt=(T[3]-lam)/(T[3]-T[2]); else wgt=1;
      s += sp[k]*wgt; }
   return s;
}

try {
   L("symbols: fitS2=" + (typeof optSSSCFitStage2Response) + " applyS2=" + (typeof optSSSCApplyColorResponse) +
     " linfit=" + (typeof optSSSCRobustLinFit) + " runS2=" + (typeof optRunSSSCStage2));

   // Seed bands (must match optSSSCSeedBand in the engine).
   var seedR=[575,600,680,720], seedG=[485,510,565,600], seedB=[400,425,495,515];
   // TRUE system bands: red shifted +28nm & wider, blue shifted -22nm; plus scalar cast.
   var trueR=[603,633,705,748], trueG=seedG, trueB=[378,403,473,493];
   var gRtrue=1.18, gBtrue=0.86;

   var stars=[];
   for(var i=0;i<80;++i){
      var T = 3000 + i*112;                   // 3000 .. ~11850 K, wide colour span
      var sp = blackbody(T);
      var bright = 0.5 + rnd();
      var nR=1+(rnd()-0.5)*0.04, nG=1+(rnd()-0.5)*0.04, nB=1+(rnd()-0.5)*0.04;
      stars.push({ ok:true, flux:sp,
                   Rm: gRtrue*intBand(sp,trueR)*bright*nR,
                   Gm: intBand(sp,trueG)*bright*nG,
                   Bm: gBtrue*intBand(sp,trueB)*bright*nB });
   }

   var gains = optSSSCFitStage1Gains(stars, grid);
   var model = optSSSCFitStage2Response(stars, grid, gains, { minStars: 50 });
   L("Stage1 residual RMS = " + model.stage1Rms.toFixed(4));
   L("Stage2 residual RMS = " + model.stage2Rms.toFixed(4));
   L("slopes bR=" + model.bR.toFixed(4) + " bB=" + model.bB.toFixed(4) + " (should be clearly non-zero)");
   L("improvement = " + (100*(1-model.stage2Rms/model.stage1Rms)).toFixed(1) + "%");
   var slopesNZ = Math.abs(model.bR) > 0.01 || Math.abs(model.bB) > 0.01;
   var improved = model.stage2Rms < 0.5 * model.stage1Rms;
   L("STAGE2 vs STAGE1: " + (improved && slopesNZ ? "PASS" : "FAIL"));

   // Apply sanity: run on a small synthetic image; verify output finite & bounded.
   var W=24,H=24,N=W*H, Rr=new Float32Array(N),Gg=new Float32Array(N),Bb=new Float32Array(N);
   for(var p=0;p<N;++p){ Rr[p]=0.2+0.3*rnd(); Gg[p]=0.2+0.3*rnd(); Bb[p]=0.2+0.3*rnd(); }
   var win=new ImageWindow(W,H,3,32,true,true,"sssc_f2_img"); var mv=win.mainView,rect=new Rect(0,0,W,H);
   mv.beginProcess(UndoFlag_NoSwapFile);
   mv.image.setSamples(Rr,rect,0); mv.image.setSamples(Gg,rect,1); mv.image.setSamples(Bb,rect,2);
   mv.endProcess();
   optSSSCApplyColorResponse(mv, model);
   var bad=false,mn=1e9,mx=-1e9;
   for(var c=0;c<3;++c) for(var yy=0;yy<H;yy+=4) for(var xx=0;xx<W;xx+=4){ var v=mv.image.sample(xx,yy,c); if(!isFinite(v)||v<0) bad=true; mn=Math.min(mn,v); mx=Math.max(mx,v); }
   L("apply output range [" + mn.toFixed(3) + ", " + mx.toFixed(3) + "] finite&>=0: " + (!bad));
   L("APPLY sanity: " + (!bad ? "PASS" : "FAIL"));
   win.forceClose();

   L("F2 DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
