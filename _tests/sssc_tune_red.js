#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"

// Empirically tune the SSSC RED seed band against SPCC (same method as blue). G band
// fixed; B band = the already-tuned [400,425,515,535]. Reports the red band whose gR best
// matches the SPCC target, plus a final SSSC-vs-SPCC star-colour check with both tuned bands.
var LOG = "C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/sssc_tune_red.log";
var P = "C:/Users/ninoc/Downloads/RGB_LDu_2.xisf";
var B = "";
function L(s){ B += String(s)+"\n"; try{File.writeTextFile(LOG,B);}catch(e){} console.writeln(s); }
function med(a){ if(!a.length)return 0; var b=a.slice().sort(function(x,y){return x-y;}); var m=b.length>>1; return (b.length&1)?b[m]:0.5*(b[m-1]+b[m]); }
function intBand(flux,grid,T){ var s=0,n=Math.min(flux.length,grid.count);
   for(var k=0;k<n;++k){ var lam=grid.start+k*grid.step,f=flux[k]; if(f<=0)continue; var w;
      if(lam<=T[0]||lam>=T[3])w=0; else if(lam<T[1])w=(lam-T[0])/(T[1]-T[0]); else if(lam>T[2])w=(T[3]-lam)/(T[3]-T[2]); else w=1;
      s+=f*w; } return s; }

try {
   var G_BAND=[485,510,565,600], B_BAND=[400,425,515,535];   // green fixed, blue already tuned
   var src=ImageWindow.open(P)[0]; src.show();

   var stars=optSSSCQueryGaiaSpectra(src,{magLow:7.0,magHigh:16.5});
   var grid=stars.grid;
   optSSSCStarPhotometry(src.mainView,stars,{});
   var rawRG=[],rawBG=[];
   for(var i=0;i<stars.length;++i){ var s=stars[i]; if(s.ok&&s.Gm>0){rawRG.push(s.Rm/s.Gm);rawBG.push(s.Bm/s.Gm);} }
   var mRawRG=med(rawRG), mRawBG=med(rawBG);

   var cw=new ImageWindow(src.mainView.image.width,src.mainView.image.height,3,32,true,true,"TUNE_SPCC_R");
   cw.mainView.beginProcess(UndoFlag_NoSwapFile); cw.mainView.image.assign(src.mainView.image); cw.mainView.endProcess();
   try{cw.copyAstrometricSolution(src);}catch(e){}
   optRunSPCCWorkflow(cw.mainView,null);
   var sp=[]; for(var j=0;j<stars.length;++j) sp.push({x:stars[j].x,y:stars[j].y});
   optSSSCStarPhotometry(cw.mainView,sp,{});
   var spRG=[],spBG=[];
   for(var j2=0;j2<sp.length;++j2){ var t=sp[j2]; if(t.ok&&t.Gm>0){spRG.push(t.Rm/t.Gm);spBG.push(t.Bm/t.Gm);} }
   var mSpRG=med(spRG), mSpBG=med(spBG);
   var gR_t=mSpRG/mRawRG, gB_t=mSpBG/mRawBG;
   L("raw R/G="+mRawRG.toFixed(4)+" B/G="+mRawBG.toFixed(4)+" | SPCC R/G="+mSpRG.toFixed(4)+" B/G="+mSpBG.toFixed(4));
   L("targets gR_t="+gR_t.toFixed(4)+" gB_t="+gB_t.toFixed(4));

   function gainForBand(band,isRed){
      var rr=[];
      for(var k=0;k<stars.length;++k){ var s=stars[k]; if(!s.ok||!s.flux||s.Gm<=0)continue;
         var eg=intBand(s.flux,grid,G_BAND), e=intBand(s.flux,grid,band); if(eg<=0||e<=0)continue;
         var m=isRed?(s.Rm/s.Gm):(s.Bm/s.Gm); if(m<=0)continue; rr.push((e/eg)/m); }
      return optSSSCRobustRatio(rr);
   }
   L("current blue band gB="+gainForBand(B_BAND,false).toFixed(4)+" (target "+gB_t.toFixed(4)+")");

   var best=null;
   L("--- red band sweep (gR vs target "+gR_t.toFixed(4)+") ---");
   for(var lo=560; lo<=650; lo+=15) for(var hi=660; hi<=740; hi+=20){
      if(hi-40 <= lo+25) continue;
      var band=[lo, lo+25, hi-40, hi];
      var gR=gainForBand(band,true), d=Math.abs(gR-gR_t);
      L("  band "+JSON.stringify(band)+" -> gR="+gR.toFixed(4)+" d="+d.toFixed(4));
      if(!best||d<best.d) best={band:band,gR:gR,d:d};
   }
   L("BEST red band = "+JSON.stringify(best.band)+" -> gR="+best.gR.toFixed(4)+" (target "+gR_t.toFixed(4)+", d="+best.d.toFixed(4)+")");
   L("TUNE-RED DONE.");
} catch(e){ L("ERROR: "+e.message+(e.stack?("\n"+e.stack):"")); }
