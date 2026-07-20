#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Empirically tune the SSSC BLUE seed band so its blue gain matches SPCC's star-colour
// balance on a real image. One Gaia query + one SPCC run; the blue band is then swept
// (cheap spectrum re-integration) to find the edges whose resulting gB best matches the
// SPCC target. R and G bands are left untouched.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_tune_blue.log";
var P = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";
var B = "";
function L(s){ B += String(s) + "\n"; try { File.writeTextFile(LOG, B); } catch(e){} console.writeln(s); }
function med(a){ if(!a.length) return 0; var b=a.slice().sort(function(x,y){return x-y;}); var m=b.length>>1; return (b.length&1)?b[m]:0.5*(b[m-1]+b[m]); }
// trapezoid integral with explicit edges [lo1,lo2,hi1,hi2]
function intBand(flux, grid, T){ var s=0,n=Math.min(flux.length,grid.count);
   for(var k=0;k<n;++k){ var lam=grid.start+k*grid.step,f=flux[k]; if(f<=0)continue; var w;
      if(lam<=T[0]||lam>=T[3])w=0; else if(lam<T[1])w=(lam-T[0])/(T[1]-T[0]); else if(lam>T[2])w=(T[3]-lam)/(T[3]-T[2]); else w=1;
      s+=f*w; } return s; }

try {
   var R_BAND=[575,600,680,720], G_BAND=[485,510,565,600];   // fixed (engine seed)
   var src = ImageWindow.open(P)[0]; src.show();

   // Gaia + photometry on ORIGINAL
   var stars = optSSSCQueryGaiaSpectra(src, { magLow:7.0, magHigh:16.5 });
   var grid = stars.grid;
   optSSSCStarPhotometry(src.mainView, stars, {});
   var rawRG=[], rawBG=[];
   for (var i=0;i<stars.length;++i){ var s=stars[i]; if(s.ok&&s.Gm>0){ rawRG.push(s.Rm/s.Gm); rawBG.push(s.Bm/s.Gm); } }
   var mRawRG=med(rawRG), mRawBG=med(rawBG);
   L("raw star median R/G=" + mRawRG.toFixed(4) + " B/G=" + mRawBG.toFixed(4) + " (" + rawRG.length + " stars)");

   // SPCC truth: clone -> SPCC -> photometer SAME stars
   var cw=new ImageWindow(src.mainView.image.width,src.mainView.image.height,3,32,true,true,"TUNE_SPCC");
   cw.mainView.beginProcess(UndoFlag_NoSwapFile); cw.mainView.image.assign(src.mainView.image); cw.mainView.endProcess();
   try{cw.copyAstrometricSolution(src);}catch(e){}
   optRunSPCCWorkflow(cw.mainView, null);
   var spStars=[]; for(var j=0;j<stars.length;++j) spStars.push({x:stars[j].x,y:stars[j].y});
   optSSSCStarPhotometry(cw.mainView, spStars, {});
   var spRG=[], spBG=[];
   for (var j2=0;j2<spStars.length;++j2){ var t=spStars[j2]; if(t.ok&&t.Gm>0){ spRG.push(t.Rm/t.Gm); spBG.push(t.Bm/t.Gm); } }
   var mSpRG=med(spRG), mSpBG=med(spBG);
   L("SPCC star median R/G=" + mSpRG.toFixed(4) + " B/G=" + mSpBG.toFixed(4) + " (" + spRG.length + " stars)");

   // SPCC's effective star-colour correction (the target SSSC should reproduce)
   var gB_t = mSpBG / mRawBG, gR_t = mSpRG / mRawRG;
   L("target gains (SPCC/raw): gR_t=" + gR_t.toFixed(4) + " gB_t=" + gB_t.toFixed(4));

   // current SSSC gains (current blue band) for reference
   var gNow = optSSSCFitStage1Gains(stars, grid);
   L("current SSSC gains: gR=" + gNow.gR.toFixed(4) + " gB=" + gNow.gB.toFixed(4) + " (blue band " + JSON.stringify([400,425,495,515]) + ")");

   // sweep blue band: blueLo (rise start) x blueHi (fall end), fixed 25/20 ramps
   function gBforBand(bandB){
      var rr=[];
      for(var k=0;k<stars.length;++k){ var s=stars[k]; if(!s.ok||!s.flux||s.Gm<=0) continue;
         var eg=intBand(s.flux,grid,G_BAND), eb=intBand(s.flux,grid,bandB); if(eg<=0||eb<=0) continue;
         var mB=s.Bm/s.Gm; if(mB<=0) continue; rr.push((eb/eg)/mB); }
      return optSSSCRobustRatio(rr);
   }
   var best=null;
   L("--- blue band sweep (gB vs target " + gB_t.toFixed(4) + ") ---");
   for (var lo=380; lo<=425; lo+=10) for (var hi=485; hi<=540; hi+=10){
      if (hi-20 <= lo+25) continue;   // need a flat top
      var band=[lo, lo+25, hi-20, hi];
      var gB=gBforBand(band);
      var d=Math.abs(gB-gB_t);
      L("  band " + JSON.stringify(band) + " -> gB=" + gB.toFixed(4) + " d=" + d.toFixed(4));
      if (!best || d<best.d) best={band:band,gB:gB,d:d};
   }
   L("BEST blue band = " + JSON.stringify(best.band) + " -> gB=" + best.gB.toFixed(4) + " (target " + gB_t.toFixed(4) + ", d=" + best.d.toFixed(4) + ")");
   L("TUNE DONE.");
} catch(e){ L("ERROR: " + e.message + (e.stack ? ("\n"+e.stack) : "")); }
