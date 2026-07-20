#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// STAR-STRETCH AUTO-TEST: build a calibrated LINEAR star-only RGB (BN+LinearFit -> SyQon
// Starless -> full-starless), then sweep AutoGHS slider values and render each + measure,
// to find good DEFAULT slider values for natural stars. SyQon Starless runs headless (it's
// an external exe). NO IntegerResample (manual decimation for save/metrics).
var DIR="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/star_sweep/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/star_stretch_sweep.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function savePng(v,path){var im=v.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1300),W=Math.floor(W0/k),H=Math.floor(H0/k);
   var sw=new ImageWindow(W,H,3,32,true,true,"sp"+Math.floor(Math.random()*1e6)),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real),rc=new Rect(0,0,W0,H0);
   for(var ch=0;ch<3;ch++){var full=new Float32Array(W0*H0);im.getSamples(full,rc,ch);var red=new Float32Array(W*H);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)red[y*W+x]=full[sy+x*k];}dst.selectedChannel=ch;dst.setSamples(red,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();sw.saveAs(path,false,false,false,false);sw.forceClose();}
function metrics(v){var im=v.image,n=im.width*im.height,rc=new Rect(0,0,im.width,im.height);
   var R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   var Y=new Float32Array(n);for(var i=0;i<n;i++)Y[i]=0.2126*R[i]+0.7152*G[i]+0.0722*Bb[i];
   var s=[],st=Math.max(1,(n/60000)|0);for(var j=0;j<n;j+=st)s.push(Y[j]);s.sort(function(a,b){return a-b;});
   var bgMed=s[(s.length*0.5)|0], thr=s[(s.length*0.995)|0]; // top 0.5% = star pixels
   var clip=0,ct=0,cs=0,cc=0,sl=0;
   for(var p=0;p<n;p+=3){var mx=Math.max(R[p],G[p],Bb[p]);if(Y[p]>=thr&&Y[p]>0.02){ct++;if(mx>=0.99)clip++;cs+=(mx-Math.min(R[p],G[p],Bb[p]))/Math.max(1e-6,mx);cc++;sl+=Y[p];}}
   return {bgMed:bgMed, clipW:100*clip/Math.max(1,ct), starChroma:cc?cs/cc:0, starLum:cc?sl/cc:0};
}
try{
   L("start");
   try{ if(!File.directoryExists(DIR)) File.createDirectory(DIR.replace(/\/$/,"")); L("dir ok"); }catch(ed){ L("dir err: "+ed); }
   var R=op(col("R","180.00s")),G=op(col("G","180.00s")),Bb=op(col("B","180.00s"));
   L("loaded R/G/B = "+!!R+"/"+!!G+"/"+!!Bb);
   var full=optCabraCombineRGB(R.id,G.id,Bb.id,R.image.width,R.image.height,"ss_full");
   L("combined RGB ch="+full.image.numberOfChannels);
   // calibrate linear
   try{optRunBackgroundNeutralization(full);L("BN ok");}catch(e){L("BN err: "+e);} try{optRunAutoLinearFitWorkflow(full);L("LF ok");}catch(e){L("LF err: "+e);}
   // decimate to a small working image (fast; renders are small anyway)
   var fim=full.image,W0=fim.width,H0=fim.height,kk=Math.ceil(Math.max(W0,H0)/1400),W=Math.floor(W0/kk),H=Math.floor(H0/kk),n=W*H,rc0=new Rect(0,0,W0,H0);
   var smCh=[];for(var c0=0;c0<3;c0++){var fc=new Float32Array(W0*H0);fim.getSamples(fc,rc0,c0);var rc=new Float32Array(n);for(var y=0;y<H;y++){var sy=(y*kk)*W0;for(var x=0;x<W;x++)rc[y*W+x]=fc[sy+x*kk];}smCh.push(rc);}
   L("decimated to "+W+"x"+H);
   // STAR EXTRACTION (no AI, headless-safe): morphological opening removes compact bright
   // peaks (stars); stars = max(0, channel - opening). Opening = erosion(boxMin) then
   // dilation(boxMax) with radius ~ star size.
   var rOpen=5;
   var starsW=new ImageWindow(W,H,3,32,true,true,"ss_stars"),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real);
   for(var ch=0;ch<3;ch++){var C=smCh[ch];var opn=optDetailBoxMax(optDetailBoxMin(C,W,H,rOpen),W,H,rOpen);var S=new Float32Array(n);for(var i=0;i<n;i++){var d=C[i]-opn[i];S[i]=d<0?0:d;}dst.selectedChannel=ch;dst.setSamples(S,new Rect(0,0,W,H));}
   dst.resetSelections();starsW.mainView.beginProcess(UndoFlag_NoSwapFile);starsW.mainView.image.assign(dst);starsW.mainView.endProcess();
   var starsLin=starsW.mainView;
   L("star layer extracted (morphological opening r="+rOpen+")");
   try{full.window.forceClose();[R,G,Bb].forEach(function(x){if(x&&x.window)x.window.forceClose();});}catch(e){}

   // sweep AutoGHS sliders: S (intensity) x iterations
   var Svals=[0.5,0.7,0.9], itVals=[3,5];
   L(""); L("config            bgMed   clipWhite%  starChroma  starLum   file");
   for(var si=0;si<Svals.length;si++)for(var it=0;it<itVals.length;it++){
      var c=optCabraClonePM(starsLin,"ss_c_"+si+"_"+it);
      optRunAutoGhsStretch(c,{aghs_intensity:Svals[si],aghs_iterations:itVals[it],aghs_bp:2.8,aghs_sigmas:1.0});
      var m=metrics(c);
      var fn="stars_S"+Svals[si].toFixed(1)+"_it"+itVals[it]+".png";
      savePng(c,DIR+fn);
      L("S"+Svals[si].toFixed(1)+" it"+itVals[it]+"          "+m.bgMed.toFixed(3)+"   "+m.clipW.toFixed(1)+"        "+m.starChroma.toFixed(3)+"      "+m.starLum.toFixed(3)+"   "+fn);
      try{c.window.forceClose();}catch(e){}
   }
   try{starsLin.window.forceClose();}catch(e){}
   L(""); L("DONE. PNGs in "+DIR);
}catch(e){L("FATAL: "+e+" | msg="+(e&&e.message)+(e&&e.stack?("\n"+e.stack):""));}
