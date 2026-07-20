#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>
// Tune the new depth/contrast methods: on a STRETCHED galaxy + nebula, apply each method at
// 3 levels, measure (global contrast, HF structure, bg noise, clip) and render PNGs so the
// best default level can be chosen. No IntegerResample (manual decimation).
var DIR="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/contrast_sweep/";
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/contrast_sweep.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/";
function m82(f){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-60.00s_FILTER-"+f+"_mono.xisf";}
function col(f){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}
function savePng(v,path){v.window.saveAs(path,false,false,false,false);}
function smallStretched(map,tag){ // combine -> calibrate -> AutoGHS -> decimate to ~1300px small view
   var full=optCabraCombineRGB(map.R.id,map.G.id,map.B.id,map.R.image.width,map.R.image.height,tag+"_f");
   try{optRunBackgroundNeutralization(full);}catch(e){} try{optRunAutoLinearFitWorkflow(full);}catch(e){}
   optRunAutoGhsStretch(full,{aghs_intensity:0.7,aghs_bp:3.0});
   var im=full.image,W0=im.width,H0=im.height,k=Math.ceil(Math.max(W0,H0)/1300),W=Math.floor(W0/k),H=Math.floor(H0/k),n=W*H,rc=new Rect(0,0,W0,H0);
   var sw=new ImageWindow(W,H,3,32,true,true,tag+"_s"),dst=new Image(W,H,3,ColorSpace_RGB,32,SampleType_Real);
   for(var c=0;c<3;c++){var fc=new Float32Array(W0*H0);im.getSamples(fc,rc,c);var rd=new Float32Array(n);for(var y=0;y<H;y++){var sy=(y*k)*W0;for(var x=0;x<W;x++)rd[y*W+x]=fc[sy+x*k];}dst.selectedChannel=c;dst.setSamples(rd,new Rect(0,0,W,H));}
   dst.resetSelections();sw.mainView.beginProcess(UndoFlag_NoSwapFile);sw.mainView.image.assign(dst);sw.mainView.endProcess();
   try{full.window.forceClose();["R","G","B"].forEach(function(kk){if(map[kk]&&map[kk].window)map[kk].window.forceClose();});}catch(e){}
   return sw.mainView;
}
function metrics(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H);
   var Y=new Float32Array(n),R=new Float32Array(n),G=new Float32Array(n),Bb=new Float32Array(n);im.getSamples(R,rc,0);im.getSamples(G,rc,1);im.getSamples(Bb,rc,2);
   var m=0;for(var i=0;i<n;i++){Y[i]=0.2126*R[i]+0.7152*G[i]+0.0722*Bb[i];m+=Y[i];}m/=n;
   var sq=0;for(var j=0;j<n;j++){var d=Y[j]-m;sq+=d*d;}var contrast=Math.sqrt(sq/n);
   var bl=optCmBoxBlur(Y,W,H,4),hf=0;for(var q=0;q<n;q++)hf+=Math.abs(Y[q]-bl[q]);hf/=n;
   var s=[],st=Math.max(1,(n/40000)|0);for(var k=0;k<n;k+=st)s.push(Y[k]);s.sort(function(a,b){return a-b;});
   var thr=s[(s.length*0.30)|0],sum=0,sq2=0,nb=0;for(var p=0;p<n;p++){if(Y[p]<=thr){var dd=Y[p]-bl[p];sum+=dd;sq2+=dd*dd;nb++;}}var mn=nb?sum/nb:0,noise=nb?Math.sqrt(Math.max(0,sq2/nb-mn*mn)):0;
   var ch=0,cl=0;for(var z=0;z<n;z+=3){var mx=Math.max(R[z],G[z],Bb[z]);if(mx>=0.99)ch++;if(Y[z]<=0.0001)cl++;}
   return {contrast:contrast,hf:hf,noise:noise,clipHi:100*ch/(n/3),clipLo:100*cl/(n/3)};
}
var ALGOS=[
 {id:"hdrmt",   key:"hdrAmount", vals:[0.30,0.50,0.70]},
 {id:"dse",     key:"dseAmount", vals:[0.20,0.30,0.45]},
 {id:"clahe",   key:"claAmount", vals:[0.30,0.50,0.70]},
 {id:"sigmoid", key:"sigStrength", vals:[3,5,8]},
 {id:"vibrance",key:"vibAmount", vals:[0.25,0.40,0.60]}
];
var TARGETS=[
 {n:"M82gal", m:function(){return {R:op(m82("R")),G:op(m82("G")),B:op(m82("B"))};}},
 {n:"Col34neb", m:function(){return {R:op(col("R")),G:op(col("G")),B:op(col("B"))};}}
];
try{
   if(!File.directoryExists(DIR))File.createDirectory(DIR.replace(/\/$/,""));
   L("=== CONTRAST/DEPTH TUNING (stretched galaxy + nebula) ===");
   for(var ti=0;ti<TARGETS.length;ti++){var T=TARGETS[ti];var map=T.m();
      if(!optSafeView(map.R)){L(T.n+": missing");continue;}
      var base=smallStretched(map,"cs"+ti);
      var bm=metrics(base);
      savePng(base,DIR+T.n+"_0_baseline.png");
      L(""); L("== "+T.n+" ==  BASELINE contrast="+bm.contrast.toFixed(4)+" hf="+bm.hf.toExponential(2)+" noise="+bm.noise.toExponential(2)+" clipHi="+bm.clipHi.toFixed(2)+"%");
      for(var a=0;a<ALGOS.length;a++){var A=ALGOS[a];
         for(var vi=0;vi<A.vals.length;vi++){
            var c=optCabraClonePM(base,"cs"+ti+"_"+A.id+"_"+vi);
            var stt=optDetailDefaultState();stt.algoId=A.id;stt[A.key]=A.vals[vi];
            try{optRunDetailOnView(c,stt);}catch(e){L("  "+A.id+" "+A.vals[vi]+" ERR "+e);}
            var mm=metrics(c);
            var fn=T.n+"_"+A.id+"_"+A.key+A.vals[vi]+".png";savePng(c,DIR+fn);
            L("  "+A.id+" "+A.key+"="+A.vals[vi]+"   contrast="+mm.contrast.toFixed(4)+" (x"+(mm.contrast/bm.contrast).toFixed(2)+")  hf="+mm.hf.toExponential(2)+"  noise="+mm.noise.toExponential(2)+"  clipHi="+mm.clipHi.toFixed(2)+"%  -> "+fn);
            try{c.window.forceClose();}catch(e){}
         }
      }
      try{base.window.forceClose();}catch(e){}
   }
   L(""); L("DONE. PNGs in "+DIR);
}catch(e){L("FATAL: "+e+" | "+(e&&e.stack?e.stack:""));}
