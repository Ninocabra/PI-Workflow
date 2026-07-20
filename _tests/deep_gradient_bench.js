#engine v8
#define PI_WORKFLOW_OPT_NO_MAIN 1
#include "../PI Workflow.js"
#include <pjsr/UndoFlag.jsh>

// DEEP GRADIENT A/B BENCH (headless-valid: ABE / AutoDBE / GraXpert are CPU/script).
//  Part A  Breadth: 6 real targets, 3 tools @ default -> relFlat / clip0 / sigKeep.
//  Part B  Tuning : AutoDBE smoothing {0.3,0.5,0.7} + GraXpert smoothing {0.5,0.8} on 1 gal + 1 neb.
//  Part C  Ground truth: inject a KNOWN gradient; run tool on original (baseline) AND on
//          original+gradient; if the tool removes the extra gradient perfectly the two
//          background maps coincide -> scale-invariant "recovery error" (lower = better).
var LOG="C:/Users/ninoc/Documents/PixInsight/Test_Scripts/PI Workflow/Dev_194/_tests/deep_gradient_bench.log";
var B=""; function L(s){B+=String(s)+"\n";try{File.writeTextFile(LOG,B);}catch(e){}}
var NER="E:/ASTRO Sin Procesar/Observatorio Nerpio/Imagenes/", ED="E:/ASTRO Sin Procesar/ED127 en Valls/";
function col(f,e){return NER+"Collinder 34 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function m82(f,e){return NER+"M82/WBPP2/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono.xisf";}
function pk(f,e){return NER+"PK 164+31.1/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function ngc(f){return ED+"NGC3184 Repetir/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-180.00s_FILTER-"+f+"_mono_autocrop.xisf";}
function cad(f,e){return NER+"Cadwell 5 COPIADO/WBPP3/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function ldu(f,e){return NER+"LDu 2 COPIADO/WBPP/master/masterLight_BIN-1_6248x4176_EXPOSURE-"+e+"_FILTER-"+f+"_mono_autocrop.xisf";}
function op(p){if(!File.exists(p))return null;var w=ImageWindow.open(p);return w&&w.length?w[0].mainView:null;}

var TARGETS=[
 {n:"M82 (galaxy)",     get:function(){return {R:op(m82("R","60.00s")),G:op(m82("G","60.00s")),B:op(m82("B","60.00s"))};}},
 {n:"NGC3184 (galaxy)", get:function(){return {R:op(ngc("R")),G:op(ngc("G")),B:op(ngc("B"))};}},
 {n:"Cadwell5 (galaxy)",get:function(){return {R:op(cad("R","180.00s")),G:op(cad("G","180.00s")),B:op(cad("B","180.00s"))};}},
 {n:"Collinder34 (neb)",get:function(){return {R:op(col("R","180.00s")),G:op(col("G","180.00s")),B:op(col("B","180.00s"))};}},
 {n:"LDu2 (neb)",       get:function(){return {R:op(ldu("R","180.00s")),G:op(ldu("G","180.00s")),B:op(ldu("B","180.00s"))};}},
 {n:"PK164 (planetary)",get:function(){return {R:op(pk("R","30.00s")),G:op(pk("G","30.00s")),B:op(pk("B","30.00s"))};}}
];

var G=24;
// tile-background map (GxG), averaged over channels. p10 per tile = local background.
function bgMap(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H),nch=im.numberOfChannels;
   var map=new Float32Array(G*G);
   for(var ch=0;ch<nch;ch++){var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      for(var ty=0;ty<G;ty++)for(var tx=0;tx<G;tx++){
         var x0=Math.floor(tx*W/G),x1=Math.floor((tx+1)*W/G),y0=Math.floor(ty*H/G),y1=Math.floor((ty+1)*H/G);
         var s=[];for(var y=y0;y<y1;y+=4){var row=y*W;for(var x=x0;x<x1;x+=4)s.push(Y[row+x]);}
         s.sort(function(a,b){return a-b;});map[ty*G+tx]+=s[Math.floor(s.length*0.10)]/nch;
      }}
   return map;
}
function mapStd(m){var mn=0;for(var i=0;i<m.length;i++)mn+=m[i];mn/=m.length;var sq=0;for(var j=0;j<m.length;j++){var d=m[j]-mn;sq+=d*d;}return Math.sqrt(sq/m.length);}
function bright5(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H),s=0,c=0;
   for(var ch=0;ch<im.numberOfChannels;ch++){var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      var a=[],st=Math.max(1,(n/60000)|0);for(var i=0;i<n;i+=st)a.push(Y[i]);a.sort(function(x,y){return x-y;});
      var k=Math.floor(a.length*0.95),m=0;for(var j=k;j<a.length;j++)m+=a[j];s+=m/Math.max(1,a.length-k);c++;}
   return s/c;}
function clip0(v){var im=v.image,W=im.width,H=im.height,n=W*H,rc=new Rect(0,0,W,H),z=0,tot=0;
   for(var ch=0;ch<im.numberOfChannels;ch++){var Y=new Float32Array(n);im.getSamples(Y,rc,ch);
      for(var i=0;i<n;i+=7){tot++;if(Y[i]<=0)z++;}}
   return 100*z/Math.max(1,tot);}
function injectGradient(v){ // known smooth gradient: diagonal ramp (0.02) + radial curvature (0.012)
   var P=new PixelMath;
   P.expression="$T + 0.020*(0.55*X()+0.45*Y()) + 0.012*((X()-0.5)*(X()-0.5)+(Y()-0.5)*(Y()-0.5))";
   P.useSingleExpression=true;P.createNewImage=false;P.truncate=true;P.truncateLower=0;P.truncateUpper=1;P.executeOn(v);
}

function runTool(view, tool, smooth){
   if(tool==="ABE") return optCabraBackgroundAuto(view);
   if(tool==="AutoDBE") return optRunAutoDBEGradientCorrection(view,{descentPathsInput:500,tolerance:1.0,smoothing:smooth,showModel:false});
   if(tool==="GraXpert"){ // direct runner reads smoothing from a mock dlg field
      var mock={ncGraXpertSmoothing:{value:smooth}}; return optRunGraXpertDirectly(view,mock);
   }
   throw new Error("unknown tool "+tool);
}
function realTest(base, tool, smooth, b0, std0){
   var c=optCabraClonePM(base,"dg_"+tool+(""+smooth).replace(".",""));
   try{
      var t0=(new Date()).getTime(); runTool(c,tool,smooth); var dt=(((new Date()).getTime()-t0)/1000).toFixed(1);
      var m=bgMap(c),bk=bright5(c),cz=clip0(c);
      var rel=mapStd(m)/Math.max(1e-9,bk), rel0=std0/Math.max(1e-9,b0);
      return {line:"relFlat="+(rel*1000).toFixed(2)+" ("+((1-rel/rel0)*100).toFixed(0)+"% flatter) sigKeep="+(100*bk/Math.max(1e-9,b0)).toFixed(0)+"% clip0="+cz.toFixed(2)+"% ("+dt+"s)"};
   }finally{try{if(c&&c.window)c.window.forceClose();}catch(e){}}
}
// Part C: recovery error. Run tool on O and on O+G; compare centered bg maps (scale-inv).
function recoveryTest(base, tool, smooth){
   var c0=optCabraClonePM(base,"dgc0_"+tool), ci=optCabraClonePM(base,"dgci_"+tool);
   try{
      runTool(c0,tool,smooth);
      injectGradient(ci); runTool(ci,tool,smooth);
      var m0=bgMap(c0),mi=bgMap(ci),sig=bright5(ci);
      var a0=0,ai=0;for(var i=0;i<m0.length;i++){a0+=m0[i];ai+=mi[i];}a0/=m0.length;ai/=mi.length;
      var sq=0;for(var j=0;j<m0.length;j++){var d=(mi[j]-ai)-(m0[j]-a0);sq+=d*d;}
      var err=Math.sqrt(sq/m0.length)/Math.max(1e-9,sig);
      return (err*1000).toFixed(2);
   }finally{try{if(c0&&c0.window)c0.window.forceClose();}catch(e){}try{if(ci&&ci.window)ci.window.forceClose();}catch(e){}}
}

try{
   L("=== DEEP GRADIENT BENCH ===");
   L("relFlat = bgStd/signal (scale-invariant; lower=flatter). recovery = residual of a KNOWN injected gradient (lower=better).");
   var gx=optResolveGraXpertExecutablePath(); L("GraXpert exe: "+(gx&&gx.length?gx:"(absent -> GraXpert skips)"));

   // ---- PART A: breadth, 6 targets, 3 tools @ default ----
   L(""); L("######## PART A — BREADTH (3 tools @ default, 6 targets) ########");
   for(var ti=0;ti<TARGETS.length;ti++){var T=TARGETS[ti];
      var map;try{map=T.get();}catch(eM){L(T.n+": map err "+eM.message);continue;}
      if(!optSafeView(map.R)||!optSafeView(map.G)||!optSafeView(map.B)){L(T.n+": channels missing");continue;}
      var base=optCabraCombineRGB(map.R.id,map.G.id,map.B.id,map.R.image.width,map.R.image.height,"dgbase"+ti);
      var b0=bright5(base),std0=mapStd(bgMap(base));
      L(""); L("== "+T.n+" =="+"  (raw relFlat="+(std0/Math.max(1e-9,b0)*1000).toFixed(2)+")");
      ["ABE","AutoDBE","GraXpert"].forEach(function(tool){
         try{var r=realTest(base,tool,(tool==="AutoDBE"?0.5:0.63),b0,std0);L("   "+tool+"\t"+r.line);}
         catch(e){L("   "+tool+"\tERR/skip: "+e.message);}
      });
      try{base.window.forceClose();["R","G","B"].forEach(function(k){if(map[k]&&map[k].window)map[k].window.forceClose();});}catch(e){}
   }

   // ---- PART B: tuning on 1 galaxy (M82) + 1 nebula (Collinder34) ----
   L(""); L("######## PART B — TUNING (AutoDBE & GraXpert smoothing sweep) ########");
   var tuneT=[{n:"M82 (galaxy)",get:TARGETS[0].get},{n:"Collinder34 (neb)",get:TARGETS[3].get}];
   for(var tj=0;tj<tuneT.length;tj++){var TT=tuneT[tj];var mp=TT.get();
      if(!optSafeView(mp.R)){L(TT.n+": missing");continue;}
      var bs=optCabraCombineRGB(mp.R.id,mp.G.id,mp.B.id,mp.R.image.width,mp.R.image.height,"dgtune"+tj);
      var bb=bright5(bs),ss=mapStd(bgMap(bs));
      L(""); L("== "+TT.n+" ==");
      [0.3,0.5,0.7].forEach(function(sm){try{L("   AutoDBE sm="+sm+"\t"+realTest(bs,"AutoDBE",sm,bb,ss).line);}catch(e){L("   AutoDBE sm="+sm+" ERR "+e.message);}});
      [0.5,0.8].forEach(function(sm){try{L("   GraXpert sm="+sm+"\t"+realTest(bs,"GraXpert",sm,bb,ss).line);}catch(e){L("   GraXpert sm="+sm+" ERR "+e.message);}});
      try{bs.window.forceClose();["R","G","B"].forEach(function(k){if(mp[k]&&mp[k].window)mp[k].window.forceClose();});}catch(e){}
   }

   // ---- PART C: ground-truth recovery of a known gradient (2 targets, 3 tools) ----
   L(""); L("######## PART C — GROUND TRUTH (known-gradient recovery error, lower=better) ########");
   for(var tk=0;tk<tuneT.length;tk++){var TC=tuneT[tk];var mc=TC.get();
      if(!optSafeView(mc.R)){L(TC.n+": missing");continue;}
      var bc=optCabraCombineRGB(mc.R.id,mc.G.id,mc.B.id,mc.R.image.width,mc.R.image.height,"dgrec"+tk);
      L(""); L("== "+TC.n+" ==");
      ["ABE","AutoDBE","GraXpert"].forEach(function(tool){
         try{L("   "+tool+"\trecoveryErr="+recoveryTest(bc,tool,(tool==="AutoDBE"?0.5:0.63)));}
         catch(e){L("   "+tool+"\tERR/skip: "+e.message);}
      });
      try{bc.window.forceClose();["R","G","B"].forEach(function(k){if(mc[k]&&mc[k].window)mc[k].window.forceClose();});}catch(e){}
   }
   L(""); L("DONE");
}catch(e){L("FATAL: "+e.message+(e.stack?("\n"+e.stack):""));}
